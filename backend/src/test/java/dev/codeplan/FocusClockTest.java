package dev.codeplan;
import dev.codeplan.model.FocusRecord;
import dev.codeplan.service.FocusClock;
import java.time.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class FocusClockTest {
    FocusRecord start() {
        FocusRecord f=new FocusRecord();f.id="test";f.status="running";f.boot="boot";f.focusMinutes=25;f.restMinutes=5;
        f.startedAt=f.lastTick=f.phaseStart=LocalDateTime.of(2026,12,31,23,59,55);return f;
    }
    @Test void pausedAndSleepingTimeNeverCountsAndMidnightSplitsExactly() {
        FocusRecord f=start();FocusClock.tick(f,f.lastTick.plusSeconds(10),"boot");
        assertThat(f.seconds()).isEqualTo(10);
        assertThat(FocusClock.secondsOn(f,LocalDate.of(2026,12,31))).isEqualTo(5);
        assertThat(FocusClock.secondsOn(f,LocalDate.of(2027,1,1))).isEqualTo(5);
        f.status="paused";FocusClock.tick(f,f.lastTick.plusSeconds(10),"boot");assertThat(f.seconds()).isEqualTo(10);
        f.status="running";FocusClock.tick(f,f.lastTick.plusMinutes(30),"boot");assertThat(f.status).isEqualTo("interrupted");assertThat(f.seconds()).isEqualTo(10);
        f.status="cancelled";assertThat(FocusClock.secondsOn(f,LocalDate.of(2027,1,1))).isZero();
    }
    @Test void crashAndClockRollbackRequireManualRecovery() {
        FocusRecord f=start();FocusClock.tick(f,f.lastTick.plusSeconds(5),"new-boot");
        assertThat(f.status).isEqualTo("interrupted");assertThat(f.seconds()).isZero();
        f.status="running";FocusClock.tick(f,f.lastTick.minusSeconds(5),"new-boot");
        assertThat(f.status).isEqualTo("interrupted");assertThat(f.seconds()).isZero();
    }
    @Test void completionClampsAtTargetAndBreakDoesNotAddFocus() {
        FocusRecord f=start();f.focusMinutes=1;
        for(int i=0;i<6;i++) FocusClock.tick(f,f.lastTick.plusSeconds(10),"boot");
        assertThat(f.status).isEqualTo("rest");assertThat(f.seconds()).isEqualTo(60);assertThat(f.notifyPending).isTrue();
        for(int i=0;i<30;i++) FocusClock.tick(f,f.lastTick.plusSeconds(10),"boot");
        assertThat(f.status).isEqualTo("finished");assertThat(f.seconds()).isEqualTo(60);
    }
}
