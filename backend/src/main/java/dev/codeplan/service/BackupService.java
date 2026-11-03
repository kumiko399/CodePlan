package dev.codeplan.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.codeplan.model.Models.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import java.io.*;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.zip.*;

@Service
public class BackupService {
    private static final int MAX_BYTES = 20 * 1024 * 1024;
    private final PlannerService planner;
    private final ObjectMapper json;
    private final Path dataDir;
    private final Map<String, Pending> pending = new HashMap<>();
    private record Pending(Snapshot snapshot, Instant expires) {}
    public record Manifest(int version, String sha256) {}
    public BackupService(PlannerService planner, ObjectMapper json, @Value("${app.data-dir}") String dataDir) {
        this.planner=planner; this.json=json; this.dataDir=Path.of(dataDir).toAbsolutePath().normalize();
    }
    public Path directory() {
        String directory=planner.settings().backupDirectory();
        return directory.isBlank() ? dataDir.resolve("backups") : Path.of(directory).toAbsolutePath().normalize();
    }
    public Path backup(String prefix) {
        return planner.exclusive(() -> {
            Path temp=null;
            try {
                Path dir=directory(); Files.createDirectories(dir);
                byte[] content=json.writeValueAsBytes(planner.snapshot());
                if(content.length>MAX_BYTES) throw new IllegalArgumentException("BACKUP_TOO_LARGE");
                Manifest manifest=new Manifest(2, checksum(content));
                temp=Files.createTempFile(dir,"codeplan-",".tmp");
                try(ZipOutputStream out=new ZipOutputStream(Files.newOutputStream(temp))) {
                    out.putNextEntry(new ZipEntry("manifest.json")); out.write(json.writeValueAsBytes(manifest)); out.closeEntry();
                    out.putNextEntry(new ZipEntry("data.json")); out.write(content); out.closeEntry();
                }
                // Round-trip verification before exposing the file or pruning any old backup.
                decode(Files.readAllBytes(temp));
                Path target=dir.resolve(prefix+"-"+LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss"))+"-"+UUID.randomUUID().toString().substring(0,8)+".zip");
                try { Files.move(temp,target,StandardCopyOption.ATOMIC_MOVE); }
                catch(AtomicMoveNotSupportedException e) { Files.move(temp,target); }
                return target;
            } catch(IOException e) { throw new IllegalStateException("BACKUP_WRITE_FAILED",e); }
            finally { if(temp!=null) try { Files.deleteIfExists(temp); } catch(IOException ignored) {} }
        });
    }
    public byte[] download(String filename) {
        if(!filename.matches("(manual|auto|before-restore)-[0-9]{8}-[0-9]{6}-[a-f0-9]{8}\\.zip")) throw new IllegalArgumentException("INVALID_BACKUP");
        try { return Files.readAllBytes(directory().resolve(filename)); }
        catch(IOException e) { throw new NoSuchElementException("BACKUP_NOT_FOUND"); }
    }
    public List<Map<String,Object>> list() {
        Path dir=directory(); if(!Files.exists(dir)) return List.of();
        try(var files=Files.list(dir)) {
            return files.filter(p -> p.getFileName().toString().matches("(manual|auto|before-restore)-[0-9]{8}-[0-9]{6}-[a-f0-9]{8}\\.zip"))
                .sorted(Comparator.reverseOrder()).map(p -> {
                    try { return Map.<String,Object>of("name",p.getFileName().toString(),"size",Files.size(p)); }
                    catch(IOException e) { throw new IllegalStateException("BACKUP_READ_FAILED",e); }
                }).toList();
        } catch(IOException e) { throw new IllegalStateException("BACKUP_READ_FAILED",e); }
    }
    public synchronized Map<String,Object> preview(byte[] bytes) {
        Snapshot snapshot=decode(bytes);
        pending.entrySet().removeIf(e -> e.getValue().expires().isBefore(Instant.now()));
        if(pending.size()>=3) pending.clear();
        String token=UUID.randomUUID().toString();
        pending.put(token,new Pending(snapshot,Instant.now().plusSeconds(600)));
        return Map.of("token",token,"createdAt",snapshot.createdAt(),"tasks",snapshot.tasks().size(),"problems",snapshot.problems().size(),"attempts",snapshot.attempts().size(),"reflections",snapshot.reflections().size());
    }
    public synchronized Map<String,String> restore(String token) {
        Pending item=pending.remove(token);
        if(item==null || item.expires().isBefore(Instant.now())) throw new IllegalArgumentException("PREVIEW_EXPIRED");
        return planner.exclusive(() -> {
            planner.validateSnapshot(item.snapshot());
            Path safety=backup("before-restore");
            planner.replaceSnapshot(item.snapshot());
            return Map.of("safetyBackup",safety.getFileName().toString());
        });
    }
    public Snapshot decode(byte[] bytes) {
        if(bytes.length>MAX_BYTES) throw new IllegalArgumentException("BACKUP_TOO_LARGE");
        Map<String,byte[]> entries=new HashMap<>(); int total=0;
        try(ZipInputStream in=new ZipInputStream(new ByteArrayInputStream(bytes))) {
            for(ZipEntry entry; (entry=in.getNextEntry())!=null;) {
                if(!Set.of("manifest.json","data.json").contains(entry.getName()) || entry.isDirectory() || entries.containsKey(entry.getName())) throw new IllegalArgumentException("INVALID_BACKUP");
                ByteArrayOutputStream out=new ByteArrayOutputStream(); byte[] buffer=new byte[8192];
                for(int n;(n=in.read(buffer))!=-1;) { total+=n; if(total>MAX_BYTES) throw new IllegalArgumentException("BACKUP_TOO_LARGE"); out.write(buffer,0,n); }
                entries.put(entry.getName(),out.toByteArray());
            }
            if(entries.size()!=2) throw new IllegalArgumentException("INVALID_BACKUP");
            Manifest manifest=json.readValue(entries.get("manifest.json"),Manifest.class);
            if((manifest.version()!=1 && manifest.version()!=2) || !checksum(entries.get("data.json")).equals(manifest.sha256())) throw new IllegalArgumentException("INVALID_BACKUP");
            Snapshot snapshot=json.readValue(entries.get("data.json"),Snapshot.class); if(snapshot.version()!=manifest.version()) throw new IllegalArgumentException("INVALID_BACKUP"); planner.validateSnapshot(snapshot); return snapshot;
        } catch(IOException | NullPointerException e) { throw new IllegalArgumentException("INVALID_BACKUP",e); }
    }
    private String checksum(byte[] bytes) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
        catch(Exception e) { throw new IllegalStateException(e); }
    }
    public void automatic() {
        planner.exclusive(() -> {
            Settings s=planner.settings(); LocalDate today=LocalDate.now();
            if(s.autoBackup() && !today.equals(s.lastAutoBackup())) {
                backup("auto"); planner.markAutoBackup(today);
                try(var files=Files.list(directory())) {
                    List<Path> old=files.filter(p -> p.getFileName().toString().matches("auto-[0-9]{8}-[0-9]{6}-[a-f0-9]{8}\\.zip"))
                        .sorted(Comparator.reverseOrder()).skip(30).toList();
                    for(Path p:old) Files.deleteIfExists(p);
                } catch(IOException e) { throw new IllegalStateException("BACKUP_PRUNE_FAILED",e); }
            }
            return null;
        });
    }
}
