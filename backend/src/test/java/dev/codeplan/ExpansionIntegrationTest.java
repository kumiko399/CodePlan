package dev.codeplan;

import dev.codeplan.model.Models.*;
import dev.codeplan.model.WorkspaceModels.*;
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

@SpringBootTest @ActiveProfiles("test")
class ExpansionIntegrationTest {
    @Autowired PlannerService planner;
    @Autowired BackupService backup;
    @Autowired JdbcTemplate jdbc;
    final LocalDate today=LocalDate.now();
    @BeforeEach void clear() { planner.replaceSnapshot(new Snapshot(1,LocalDateTime.now(),List.of(),List.of(),List.of(),List.of(),List.of(),new Preferences("zh","system","blue",false,false,false))); }
    TaskInput task(String title,LocalDate day,String status) {return new TaskInput(title,"study",day,null,"medium","",status,null,null);}
    Problem problem() {return planner.saveProblem(null,new ProblemInput("力扣","1","两数之和","","easy","数组","原文"));}
    void roundTrip() throws Exception {byte[] bytes=Files.readAllBytes(backup.backup("manual"));backup.restore((String)backup.preview(bytes).get("token"));}

    @Test void taskEmojiSurvivesEditTrashAndBackupAndOldDataDefaults() throws Exception {
        TaskInput input=new TaskInput("篮球训练","sport",today,null,"medium","备注","todo",null,null,new TaskDetails(null,null,List.of(),null,"🏀"),false);
        Task task=planner.saveTask(null,input);
        planner.saveTask(task.id(),new TaskInput("篮球训练改名","sport",today.plusDays(1),null,"high","新备注","todo",null,null));
        planner.deleteTask(task.id()); planner.restoreTask(task.id()); roundTrip();
        assertThat(planner.snapshot().extras()).anyMatch(r->r.kind().equals("task") && r.recordId().equals(task.id()) && r.payload().contains("🏀"));
        assertThatThrownBy(()->planner.saveTask(null,new TaskInput("无效图标","study",today,null,"medium","","todo",null,null,new TaskDetails(null,null,List.of(),null,"<script>"),false))).isInstanceOf(IllegalArgumentException.class);
        Task old=planner.saveTask(null,task("旧任务",today,"todo")); roundTrip();
        assertThat(planner.tasks()).anyMatch(t->t.id().equals(old.id()));
    }

    @Test void templateCreationIsAtomicAndRetryDoesNotDuplicate() {
        var first=new TemplateItem("模板一","study","medium","",null,0,List.of(new Subtask("step","先准备",true)));
        var second=new TemplateItem("trigger-template-failure","life","low","",null,1,List.of());
        String template=planner.saveTemplate(null,new TemplateInput("一组任务",List.of(first,second)));
        assertThat(planner.previewTemplate(template,today)).hasSize(2).allMatch(t->t.status().equals("todo"));
        String request=UUID.randomUUID().toString();
        jdbc.execute("ALTER TABLE task ADD CONSTRAINT test_template_failure CHECK(title <> 'trigger-template-failure')");
        try { assertThatThrownBy(()->planner.createFromTemplate(template,today,request)).isInstanceOf(RuntimeException.class);assertThat(planner.tasks()).isEmpty(); }
        finally {jdbc.execute("ALTER TABLE task DROP CONSTRAINT test_template_failure");}
        List<String> ids=planner.createFromTemplate(template,today,request);
        assertThat(planner.createFromTemplate(template,today,request)).isEqualTo(ids);assertThat(planner.tasks()).hasSize(2);
        assertThat(planner.snapshot().extras()).filteredOn(r->r.kind().equals("task")).allMatch(r->!r.payload().contains("\"done\":true"));
        assertThatThrownBy(()->planner.createFromTemplate(template,today.plusDays(1),request)).hasMessage("REQUEST_CONFLICT");
    }
    @Test void customCategoryKeepsHistoryAndRoundTripsBackup() throws Exception {
        String category=planner.saveCategory(null,new CustomCategory("志愿服务","🤝","teal",true));
        Task original=planner.saveTask(null,new TaskInput("校园服务",category,today,null,"medium","","todo",null,null));
        planner.saveCategory(category,new CustomCategory("校园志愿","🌱","green",false));
        planner.saveTask(original.id(),new TaskInput("更新旧任务",category,today,null,"medium","","done",null,null));
        assertThatThrownBy(()->planner.saveTask(null,new TaskInput("新任务",category,today,null,"medium","","todo",null,null))).hasMessage("CATEGORY_UNAVAILABLE");
        String template=planner.saveTemplate(null,new TemplateInput("停用模板",List.of(new TemplateItem("模板",category,"low","",null,0,List.of()))));
        assertThatThrownBy(()->planner.previewTemplate(template,today)).hasMessage("CATEGORY_UNAVAILABLE");
        roundTrip();assertThat(planner.tasks().getFirst().category()).isEqualTo(category);
        assertThat(planner.snapshot().extras()).anyMatch(r->r.kind().equals("category") && r.payload().contains("校园志愿"));
    }
    @Test void focusHasOneSessionAndRecoveryRequiresExplicitAction() throws Exception {
        Task task=planner.saveTask(null,task("专注",today,"todo"));var focus=planner.startFocus(task.id());
        assertThatThrownBy(()->planner.startFocus(task.id())).hasMessage("FOCUS_ACTIVE");
        assertThatThrownBy(()->planner.deleteTask(task.id())).hasMessage("FOCUS_ACTIVE");
        assertThat(planner.controlFocus(focus.id,"pause").status).isEqualTo("paused");roundTrip();
        assertThat(planner.controlFocus(focus.id,"resume").status).isEqualTo("running");
        var finished=planner.controlFocus(focus.id,"finish");assertThat(finished.status).isEqualTo("finished");
        assertThat(planner.controlFocus(focus.id,"finish").spans).isEqualTo(finished.spans);
        assertThat(planner.tasks().getFirst().status()).isEqualTo("todo");assertThat(planner.statistics(today,today).get("passed")).isEqualTo(0);
    }
    @Test void weeklyReportUsesRecordedReschedulesAndKeepsReflection() throws Exception {
        LocalDate monday=today.minusDays(today.getDayOfWeek().getValue()-1);
        Task task=planner.saveTask(null,task("本周",monday,"todo"));planner.saveTask(task.id(),task("本周",monday.plusDays(1),"done"));
        Problem p=problem();planner.saveAttempt(null,new AttemptInput(p.id(),null,LocalDateTime.now(),"passed",10,""));planner.saveAttempt(null,new AttemptInput(p.id(),null,LocalDateTime.now(),"passed",10,""));
        planner.saveWeek(monday,"保持练习\n下周继续");Map<String,Object> report=planner.weekly(today);
        assertThat(report).containsEntry("from",monday).containsEntry("passed",1).containsEntry("attempts",2).containsEntry("completed",1L);
        assertThat((List<?>)report.get("reschedules")).hasSize(1);roundTrip();assertThat(planner.weekly(today).get("review")).isEqualTo("保持练习\n下周继续");
    }
    @Test void structuredNotesPreserveCodeAndFlagsNeverChangePassCounts() throws Exception {
        Problem p=problem();String code="  if (a < b) {\n    return \"<script>测试</script>\";\n  }\n";
        var detail=new ProblemDetails("思路","O(n)","O(1)","边界",code,"java",true,true);
        planner.saveProblem(p.id(),new ProblemInput(p.platform(),p.number(),p.title(),p.url(),p.difficulty(),p.tags(),"原有笔记",detail));
        assertThat(planner.statistics(today,today).get("passed")).isEqualTo(0);roundTrip();
        var row=planner.snapshot().extras().stream().filter(r->r.kind().equals("problem")).findFirst().orElseThrow();
        var json=new com.fasterxml.jackson.databind.ObjectMapper().readTree(row.payload());
        assertThat(json.path("code").asText()).isEqualTo(code);assertThat(json.path("favorite").asBoolean()).isTrue();
        assertThat(planner.problems().getFirst().notes()).isEqualTo("原有笔记");
    }
    @Test void backupCannotIntroduceTwoActivePlansForOneProblemOnTheSameDay() {
        Problem p=problem();
        Task first=planner.saveTask(null,new TaskInput("第一项","algorithm",today,null,"medium","","todo",p.id(),null));
        Task duplicate=new Task(UUID.randomUUID().toString(),first.title(),first.category(),first.planDate(),first.taskTime(),first.priority(),first.notes(),first.status(),null,p.id(),null,null,null,false);
        Snapshot original=planner.snapshot();
        Snapshot invalid=new Snapshot(2,original.createdAt(),List.of(first,duplicate),original.problems(),original.attempts(),original.reflections(),original.rules(),original.preferences(),original.extras());
        assertThatThrownBy(()->planner.replaceSnapshot(invalid)).hasMessage("INVALID_BACKUP");
        assertThat(planner.tasks()).hasSize(1);
    }
}
