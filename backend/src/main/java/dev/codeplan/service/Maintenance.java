package dev.codeplan.service;

import java.time.LocalDate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class Maintenance {
    private final PlannerService planner;
    private final BackupService backup;
    private volatile String lastError="";
    public Maintenance(PlannerService planner,BackupService backup) { this.planner=planner; this.backup=backup; }
    public String error() { return lastError; }
    @Scheduled(initialDelay=5000,fixedDelay=5000)
    public void focusClock() { try { planner.tickFocus(java.time.LocalDateTime.now()); } catch(Exception e) { lastError="MAINTENANCE_FAILED"; } }
    @Scheduled(initialDelay=5000,fixedDelay=60000)
    public void run() {
        try { planner.generate(LocalDate.now()); backup.automatic(); lastError=""; }
        catch(Exception e) { lastError="MAINTENANCE_FAILED"; }
    }
}
