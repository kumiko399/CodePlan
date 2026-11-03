package dev.codeplan;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.codeplan.mapper.PlannerMapper;
import dev.codeplan.model.Models.*;
import dev.codeplan.service.DatabaseMigration;
import java.nio.file.*;
import java.util.*;
import java.util.zip.ZipFile;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class MigrationTest {
    final Path directory = Path.of(".local", "migration-test-"+UUID.randomUUID());
    final JdbcTemplate jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1","sa",""));
    final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    DatabaseMigration migration() {
        PlannerMapper db=mock(PlannerMapper.class);
        when(db.settings()).thenReturn(new Settings(1,"zh","system","blue",false,false,false,"",null));
        return new DatabaseMigration(jdbc,db,json,directory.toString());
    }
    @Test void protectionArchiveAndIdempotentRestart() throws Exception {
        DatabaseMigration migration=migration(); migration.afterPropertiesSet();
        String file=jdbc.queryForObject("SELECT backup_file FROM schema_history",String.class);
        try(ZipFile zip=new ZipFile(file)) {
            Snapshot snapshot=json.readValue(zip.getInputStream(zip.getEntry("data.json")),Snapshot.class);
            assertThat(snapshot.version()).isEqualTo(1);
            assertThat(snapshot.preferences().language()).isEqualTo("zh");
        }
        migration.afterPropertiesSet();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM schema_history",Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT state FROM schema_history",String.class)).isEqualTo("APPLIED");
        jdbc.update("UPDATE schema_history SET state='PENDING'");
        migration.afterPropertiesSet();
        assertThat(jdbc.queryForObject("SELECT state FROM schema_history",String.class)).isEqualTo("APPLIED");
    }
    @Test void interruptedUpgradeRequiresItsProtectionCopy() throws Exception {
        DatabaseMigration migration=migration(); migration.afterPropertiesSet();
        Path file=Path.of(jdbc.queryForObject("SELECT backup_file FROM schema_history",String.class));
        jdbc.update("UPDATE schema_history SET state='FAILED'"); Files.writeString(file,"corrupt");
        assertThatThrownBy(migration::afterPropertiesSet).isInstanceOf(Exception.class);
        assertThat(jdbc.queryForObject("SELECT state FROM schema_history",String.class)).isEqualTo("FAILED");
    }
    @Test void changedMigrationOrNewerDatabaseCannotBeOpened() throws Exception {
        DatabaseMigration migration=migration(); migration.afterPropertiesSet();
        jdbc.update("UPDATE schema_history SET checksum='changed'");
        assertThatThrownBy(migration::afterPropertiesSet).hasMessage("MIGRATION_CHECKSUM_CHANGED");
        jdbc.update("UPDATE schema_history SET version=99");
        assertThatThrownBy(migration::afterPropertiesSet).hasMessage("DATABASE_REQUIRES_NEWER_APP");
    }
    @Test void failedDdlLeavesLegacyRowsAndResumesAfterRepair() throws Exception {
        jdbc.execute("CREATE TABLE legacy_sentinel (title VARCHAR(50))");
        jdbc.update("INSERT INTO legacy_sentinel VALUES('keep this record')");
        jdbc.execute("CREATE TABLE planner_extra (wrong_column INT)");
        DatabaseMigration migration=migration();
        assertThatThrownBy(migration::afterPropertiesSet).hasMessage("MIGRATION_FAILED_DATA_PRESERVED");
        assertThat(jdbc.queryForObject("SELECT title FROM legacy_sentinel",String.class)).isEqualTo("keep this record");
        assertThat(jdbc.queryForObject("SELECT state FROM schema_history",String.class)).isEqualTo("FAILED");
        // This is a deliberately malformed table in a fresh in-memory test database only.
        jdbc.execute("DROP TABLE planner_extra");
        migration.afterPropertiesSet();
        assertThat(jdbc.queryForObject("SELECT state FROM schema_history",String.class)).isEqualTo("APPLIED");
        assertThat(jdbc.queryForObject("SELECT title FROM legacy_sentinel",String.class)).isEqualTo("keep this record");
    }
}
