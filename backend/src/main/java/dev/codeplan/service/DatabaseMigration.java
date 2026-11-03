package dev.codeplan.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.codeplan.mapper.PlannerMapper;
import dev.codeplan.model.Models.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.*;
import java.util.zip.*;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.sql.init.dependency.DependsOnDatabaseInitialization;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Append-only, restartable DDL. Never drop/recreate a user's business tables. */
@Component
@DependsOnDatabaseInitialization
public class DatabaseMigration implements InitializingBean {
    private final JdbcTemplate jdbc;
    private final PlannerMapper db;
    private final ObjectMapper json;
    private final Path directory;
    public DatabaseMigration(JdbcTemplate jdbc, PlannerMapper db, ObjectMapper json,
        @Value("${app.data-dir}") String directory) {
        this.jdbc=jdbc; this.db=db; this.json=json; this.directory=Path.of(directory).resolve("upgrades");
    }
    @Override public void afterPropertiesSet() throws Exception {
        // Git can check out CRLF on Windows; line endings must not change a released migration's checksum.
        String sql = new ClassPathResource("migrations/V2__workspace.sql").getContentAsString(StandardCharsets.UTF_8).replace("\r\n","\n");
        jdbc.execute("CREATE TABLE IF NOT EXISTS schema_history (version INT PRIMARY KEY, checksum VARCHAR(64) NOT NULL, state VARCHAR(12) NOT NULL, backup_file VARCHAR(2000) NOT NULL)");
        Integer latest = jdbc.queryForObject("SELECT COALESCE(MAX(version),0) FROM schema_history", Integer.class);
        if(latest>2) throw new IllegalStateException("DATABASE_REQUIRES_NEWER_APP");
        String checksum = hash(sql.getBytes(StandardCharsets.UTF_8));
        List<Map<String,Object>> history = jdbc.queryForList("SELECT * FROM schema_history WHERE version=2");
        if(!history.isEmpty() && !checksum.equals(history.getFirst().get("checksum"))) throw new IllegalStateException("MIGRATION_CHECKSUM_CHANGED");
        if(!history.isEmpty() && "APPLIED".equals(history.getFirst().get("state"))) return;
        if(history.isEmpty()) {
            Path backup = protectLegacyData();
            jdbc.update("INSERT INTO schema_history(version,checksum,state,backup_file) VALUES(2,?,'PENDING',?)",checksum,backup.toString());
        } else {
            // A failed migration is resumed only while its original protection copy remains valid.
            Path backup=Path.of((String)history.getFirst().get("backup_file"));
            if(!Files.isRegularFile(backup)) throw new IllegalStateException("MIGRATION_BACKUP_MISSING");
            verifyArchive(backup);
        }
        try {
            for(String command:sql.split(";")) if(!command.isBlank()) jdbc.execute(command);
            jdbc.queryForList("SELECT kind,record_id,payload FROM planner_extra WHERE 1=0");
            jdbc.queryForList("SELECT meta_key,meta_value FROM planner_meta WHERE 1=0");
            jdbc.update("UPDATE schema_history SET state='APPLIED' WHERE version=2");
        } catch(RuntimeException error) {
            jdbc.update("UPDATE schema_history SET state='FAILED' WHERE version=2");
            throw new IllegalStateException("MIGRATION_FAILED_DATA_PRESERVED",error);
        }
    }
    private Path protectLegacyData() throws Exception {
        Settings s=db.settings();
        Snapshot snapshot=new Snapshot(1,LocalDateTime.now(),db.tasks(),db.problems(),db.attempts(),db.reflections(),db.rules(),
            new Preferences(s.language(),s.theme(),s.color(),s.repeatEnabled(),s.remindersEnabled(),s.autoBackup()));
        byte[] content=json.writeValueAsBytes(snapshot);
        if(content.length>20*1024*1024) throw new IllegalStateException("MIGRATION_BACKUP_TOO_LARGE");
        Files.createDirectories(directory);
        Path temp=Files.createTempFile(directory,"upgrade-",".tmp");
        Path target=directory.resolve("before-v2-"+UUID.randomUUID()+".zip");
        try {
            try(ZipOutputStream out=new ZipOutputStream(Files.newOutputStream(temp))) {
                out.putNextEntry(new ZipEntry("manifest.json")); out.write(json.writeValueAsBytes(Map.of("version",1,"sha256",hash(content)))); out.closeEntry();
                out.putNextEntry(new ZipEntry("data.json")); out.write(content); out.closeEntry();
            }
            verifyArchive(temp);
            try { Files.move(temp,target,StandardCopyOption.ATOMIC_MOVE); }
            catch(AtomicMoveNotSupportedException e) { Files.move(temp,target); }
            return target;
        } finally { Files.deleteIfExists(temp); }
    }
    private void verifyArchive(Path file) throws Exception {
        try(ZipFile zip=new ZipFile(file.toFile())) {
            byte[] bytes=zip.getInputStream(zip.getEntry("data.json")).readNBytes(20*1024*1024+1);
            var manifest=json.readTree(zip.getInputStream(zip.getEntry("manifest.json")));
            if(bytes.length>20*1024*1024 || !hash(bytes).equals(manifest.path("sha256").asText()) || json.readTree(bytes).path("version").asInt()!=1)
                throw new IllegalStateException("MIGRATION_BACKUP_INVALID");
        }
    }
    private static String hash(byte[] value) throws Exception { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value)); }
}
