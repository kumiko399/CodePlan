package dev.codeplan;

import dev.codeplan.model.Models.*;
import dev.codeplan.service.*;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest
@ActiveProfiles("test")
class PlannerIntegrationTest {
    @Autowired PlannerService planner;
    @Autowired BackupService backup;
    @Autowired JdbcTemplate jdbc;
    final LocalDate today=LocalDate.now();
    @BeforeEach void clear() {
        planner.replaceSnapshot(new Snapshot(1,LocalDateTime.now(),List.of(),List.of(),List.of(),List.of(),List.of(),new Preferences("zh","system","blue",false,false,false)));
    }
    TaskInput task(String title,LocalDate day,String problemId,String status) {
        return new TaskInput(title,problemId==null?"study":"algorithm",day,null,"medium","",status,problemId,null);
    }
    Problem problem() {return planner.saveProblem(null,new ProblemInput("力扣中国","1","两数之和","https://leetcode.cn/problems/two-sum/","easy","数组,哈希表",""));}
    void enable(boolean repeat,boolean reminders) {planner.saveSettings(new SettingsInput("zh","system","blue",repeat,reminders,false,""));}
    @Test void taskCrudPersistsAndReopeningClearsCompletion() {
        Task saved=planner.saveTask(null,task("学习 Java",today,null,"todo"));
        assertThat(jdbc.queryForObject("SELECT title FROM task WHERE id=?",String.class,saved.id())).isEqualTo("学习 Java");
        planner.saveTask(saved.id(),task("学习 Java",today,null,"done"));
        assertThat(planner.tasks().getFirst().completedAt()).isNotNull();
        planner.saveTask(saved.id(),task("学习 Java",today.plusDays(1),null,"todo"));
        assertThat(planner.tasks().getFirst().completedAt()).isNull();
        planner.deleteTask(saved.id()); assertThat(planner.tasks()).isEmpty();
        assertThatThrownBy(()->planner.saveTask(null,task(" ",today,null,"todo"))).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void repeatedPassesCountOnceAndTaskCompletionIsIndependent() {
        Problem p=problem(); Task task=planner.saveTask(null,task(p.title(),today,p.id(),"done"));
        assertThat(planner.statistics(today,today).get("passed")).isEqualTo(0);
        planner.saveAttempt(null,new AttemptInput(p.id(),task.id(),LocalDateTime.now(),"passed",10,""));
        planner.saveAttempt(null,new AttemptInput(p.id(),task.id(),LocalDateTime.now(),"passed",20,""));
        planner.saveAttempt(null,new AttemptInput(p.id(),task.id(),LocalDateTime.now(),"failed",5,""));
        assertThat(planner.statistics(today,today)).containsEntry("attempts",3).containsEntry("passed",1);
        planner.deleteTask(task.id()); assertThat(planner.attempts()).hasSize(3).allMatch(a->task.id().equals(a.taskId()));
        planner.purgeTask(task.id()); assertThat(planner.attempts()).hasSize(3).allMatch(a->a.taskId()==null);
    }
    @Test void problemAndDailyPlanDuplicatesAreRejected() {
        Problem p=problem();
        assertThatThrownBy(this::problem).hasMessage("DUPLICATE_PROBLEM");
        planner.saveTask(null,task(p.title(),today,p.id(),"todo"));
        assertThatThrownBy(()->planner.saveTask(null,task(p.title(),today,p.id(),"todo"))).hasMessage("DUPLICATE_PLAN");
        assertThatThrownBy(()->planner.deleteProblem(p.id())).hasMessage("PROBLEM_IN_USE");
        assertThatThrownBy(()->PlannerService.normalizeUrl("javascript:alert(1)")).hasMessage("INVALID_URL");
    }
    @Test void repeatGenerationIsIdempotentAndDoesNotResurrectDeletedInstances() {
        enable(true,false);
        planner.saveRule(null,new RuleInput("运动","sport","low","",null,null,today,null,"daily","",null,true));
        assertThat(planner.tasks()).hasSize(30);
        planner.generate(today); assertThat(planner.tasks()).hasSize(30);
        String deleted=planner.tasks().getFirst().id(); planner.deleteTask(deleted);
        planner.generate(today); assertThat(planner.tasks()).hasSize(29);
        enable(false,false); planner.generate(today.plusDays(2)); assertThat(planner.tasks()).hasSize(29);
        enable(true,false); planner.generate(today.plusDays(2)); assertThat(planner.tasks()).hasSize(31);
    }
    @Test void weeklyRulesRespectDaysAndKeepCompletedHistoryWhenStopped() {
        enable(true,false);
        Rule r=planner.saveRule(null,new RuleInput("算法","algorithm","medium","",null,null,today,today.plusDays(13),"weekly",""+today.getDayOfWeek().getValue(),null,true));
        assertThat(planner.tasks()).hasSize(2);
        Task first=planner.tasks().getFirst(); planner.saveTask(first.id(),new TaskInput(first.title(),first.category(),first.planDate(),null,"medium","","done",null,null));
        planner.saveRule(r.id(),new RuleInput(r.title(),r.category(),r.priority(),r.notes(),null,null,r.startDate(),r.endDate(),r.frequency(),r.weekdays(),null,false));
        assertThat(planner.tasks()).hasSize(1).allMatch(t->t.status().equals("done"));
    }
    @Test void remindersRequireOptInAndAreClaimedOnce() {
        TaskInput input=new TaskInput("喝水","life",today,null,"low","","todo",null,"00:00");
        planner.saveTask(null,input); assertThat(planner.claimReminders(LocalDateTime.now())).isEmpty();
        enable(false,true); assertThat(planner.claimReminders(LocalDateTime.now())).hasSize(1);
        assertThat(planner.claimReminders(LocalDateTime.now())).isEmpty();
    }
    @Test void backupRoundTripPreservesDataAndCreatesSafetyCopy() throws Exception {
        planner.saveTask(null,task("保留任务",today,null,"todo")); planner.saveReflection(today,"今天很充实");
        Path path=backup.backup("manual"); byte[] bytes=Files.readAllBytes(path);
        String token=(String)backup.preview(bytes).get("token");
        planner.saveTask(null,task("稍后增加",today,null,"todo"));
        Map<String,String> restored=backup.restore(token);
        assertThat(planner.tasks()).hasSize(1).extracting(Task::title).containsExactly("保留任务");
        assertThat(planner.reflections().getFirst().content()).isEqualTo("今天很充实");
        assertThat(Files.exists(backup.directory().resolve(restored.get("safetyBackup")))).isTrue();
        assertThatThrownBy(()->backup.restore(token)).hasMessage("PREVIEW_EXPIRED");
    }
    @Test void corruptBackupNeverChangesExistingData() {
        planner.saveTask(null,task("重要任务",today,null,"todo"));
        assertThatThrownBy(()->backup.preview("invalid zip".getBytes())).hasMessage("INVALID_BACKUP");
        assertThat(planner.tasks()).hasSize(1);
    }
    @Test void restoreRollsBackAllDeletesWhenADatabaseWriteFails() {
        planner.saveTask(null,task("原始数据",today,null,"todo"));
        Snapshot source=new Snapshot(1,LocalDateTime.now(),List.of(),List.of(),List.of(),List.of(new Reflection(today,"trigger-write-failure")),List.of(),new Preferences("en","dark","blue",false,false,false));
        jdbc.execute("ALTER TABLE reflection ADD CONSTRAINT test_write_failure CHECK(content <> 'trigger-write-failure')");
        try {
            assertThatThrownBy(()->planner.replaceSnapshot(source)).isInstanceOf(RuntimeException.class);
            assertThat(planner.tasks()).extracting(Task::title).containsExactly("原始数据");
            assertThat(planner.settings().language()).isEqualTo("zh");
        } finally {jdbc.execute("ALTER TABLE reflection DROP CONSTRAINT test_write_failure");}
    }
    @Test void invalidBackupReferencesAreRejectedBeforeDeletion() {
        planner.saveTask(null,task("原始数据",today,null,"todo"));
        Snapshot bad=new Snapshot(1,LocalDateTime.now(),List.of(),List.of(),List.of(new Attempt(UUID.randomUUID().toString(),UUID.randomUUID().toString(),null,LocalDateTime.now(),"passed",1,"")),List.of(),List.of(),new Preferences("zh","system","blue",false,false,false));
        assertThatThrownBy(()->planner.replaceSnapshot(bad)).hasMessage("INVALID_BACKUP");
        assertThat(planner.tasks()).hasSize(1);
    }
    @Test void allCampusCategoriesPersistAppearInStatisticsAndRestore() throws Exception {
        for (String category : dev.codeplan.model.Categories.IDS) {
            Task saved = planner.saveTask(null,new TaskInput(category,category,today,null,"medium","","todo",null,null));
            planner.saveTask(saved.id(),new TaskInput("Edited " + category,category,today,null,"high","","done",null,null));
        }
        assertThat(planner.tasks()).hasSize(14).allMatch(t -> t.status().equals("done"));
        @SuppressWarnings("unchecked")
        List<Map<String,Object>> groups = (List<Map<String,Object>>) planner.statistics(today,today).get("categories");
        assertThat(groups).hasSize(14).allSatisfy(group -> {
            assertThat(group.get("total")).isEqualTo(1);
            assertThat(group.get("completed")).isEqualTo(1L);
        });
        byte[] bytes = Files.readAllBytes(backup.backup("manual"));
        planner.deleteTask(planner.tasks().getFirst().id());
        backup.restore((String) backup.preview(bytes).get("token"));
        assertThat(planner.tasks()).extracting(Task::category).containsExactlyInAnyOrderElementsOf(dev.codeplan.model.Categories.IDS);
        assertThatThrownBy(() -> planner.saveTask(null,new TaskInput("Invalid","unknown",today,null,"medium","","todo",null,null))).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void newCategoriesWorkForRepeatRulesAndCategoryChanges() {
        enable(true,false);
        for (String category : dev.codeplan.model.Categories.IDS) {
            planner.saveRule(null,new RuleInput(category,category,"medium","",null,null,today,today,"daily","",null,true));
        }
        assertThat(planner.tasks()).extracting(Task::category).containsExactlyInAnyOrderElementsOf(dev.codeplan.model.Categories.IDS);
        Rule rule = planner.rules().getFirst();
        planner.saveRule(rule.id(),new RuleInput("Updated","career","medium","",null,null,today,today,"daily","",null,true));
        assertThat(planner.tasks()).filteredOn(t -> rule.id().equals(t.ruleId())).hasSize(1).allMatch(t -> t.category().equals("career"));
    }

    @Test void deadlineSurvivesReschedulingAndBothBackupVersions() throws Exception {
        var details=new dev.codeplan.model.WorkspaceModels.TaskDetails(today.plusDays(2),"20:00",List.of(),null);
        Task saved=planner.saveTask(null,new TaskInput("截止测试","study",today,null,"medium","","todo",null,null,details,false));
        planner.saveTask(saved.id(),task("截止测试",today.plusDays(1),null,"todo"));
        assertThat(planner.snapshot().extras()).anyMatch(r->r.kind().equals("task") && r.payload().contains("20:00"));
        byte[] bytes=Files.readAllBytes(backup.backup("manual"));
        planner.deleteTask(saved.id());
        backup.restore((String)backup.preview(bytes).get("token"));
        assertThat(planner.snapshot().extras()).anyMatch(r->r.kind().equals("task") && r.payload().contains("20:00"));
        var snapshot=planner.snapshot();
        planner.replaceSnapshot(new Snapshot(1,snapshot.createdAt(),snapshot.tasks(),snapshot.problems(),snapshot.attempts(),snapshot.reflections(),snapshot.rules(),snapshot.preferences()));
        assertThat(planner.snapshot().extras()).isEmpty();
        assertThat(planner.tasks()).hasSize(1);
        assertThatThrownBy(()->planner.saveTask(null,new TaskInput("无日期","study",today,null,"medium","","todo",null,null,new dev.codeplan.model.WorkspaceModels.TaskDetails(null,"20:00",List.of(),null),false))).hasMessage("DEADLINE_DATE_REQUIRED");
    }

    @Test void subtasksAreIndependentAndTrashKeepsHistory() throws Exception {
        var sub=new dev.codeplan.model.WorkspaceModels.Subtask(UUID.randomUUID().toString(),"独立步骤",false);
        var detail=new dev.codeplan.model.WorkspaceModels.TaskDetails(today,"23:00",List.of(sub),null);
        Task task=planner.saveTask(null,new TaskInput("父任务","study",today,null,"medium","","todo",null,"00:00",detail,false));
        assertThatThrownBy(()->planner.saveTask(task.id(),new TaskInput("父任务","study",today,null,"medium","","done",null,null,detail,false))).hasMessage("INCOMPLETE_SUBTASKS");
        planner.saveTask(task.id(),new TaskInput("父任务","study",today,null,"medium","","done",null,null,detail,true));
        assertThat(planner.snapshot().extras()).anyMatch(r->r.payload().contains("独立步骤") && r.payload().contains("false"));
        planner.deleteTask(task.id()); assertThat(planner.tasks()).isEmpty(); assertThat(planner.trash()).hasSize(1);
        byte[] bytes=Files.readAllBytes(backup.backup("manual")); planner.purgeTask(task.id());
        backup.restore((String)backup.preview(bytes).get("token")); assertThat(planner.trash()).hasSize(1);
        planner.restoreTask(task.id()); assertThat(planner.tasks()).hasSize(1); assertThat(planner.trash()).isEmpty();
    }
    @Test void trashRestoreConflictsNeverOverwriteAndOldRemindersStaySilent() {
        enable(false,true); Problem p=problem();
        Task first=planner.saveTask(null,new TaskInput("first","algorithm",today,null,"medium","","todo",p.id(),"00:00"));
        planner.deleteTask(first.id());
        Task second=planner.saveTask(null,task("second",today,p.id(),"todo"));
        assertThatThrownBy(()->planner.restoreTask(first.id())).hasMessage("DUPLICATE_PLAN");
        assertThat(planner.tasks()).extracting(Task::id).containsExactly(second.id());
        planner.deleteTask(second.id()); planner.restoreTask(first.id());
        assertThat(planner.claimReminders(LocalDateTime.now())).isEmpty();
    }
    @Test void purgedRepeatOccurrenceStaysDeletedAfterRuleEditAndBackup() throws Exception {
        enable(true,false);
        var sub=new dev.codeplan.model.WorkspaceModels.Subtask(UUID.randomUUID().toString(),"阅读",false);
        Rule rule=planner.saveRule(null,new RuleInput("每天学习","study","medium","",null,null,today,today.plusDays(1),"daily","",null,true,List.of(sub)));
        assertThat(planner.tasks()).hasSize(2);
        var rows=planner.snapshot().extras().stream().filter(r->r.kind().equals("task")).toList();
        assertThat(rows.get(0).payload()).isNotEqualTo(rows.get(1).payload());
        Task deleted=planner.tasks().getFirst(); planner.deleteTask(deleted.id()); planner.purgeTask(deleted.id());
        planner.saveRule(rule.id(),new RuleInput("改名","study","medium","",null,null,today,today.plusDays(1),"daily","",null,true,List.of(sub)));
        assertThat(planner.tasks()).hasSize(1).noneMatch(t->t.occurrenceDate().equals(deleted.occurrenceDate()));
        byte[] bytes=Files.readAllBytes(backup.backup("manual"));
        backup.restore((String)backup.preview(bytes).get("token")); planner.generate(today);
        assertThat(planner.tasks()).hasSize(1);
    }
}
