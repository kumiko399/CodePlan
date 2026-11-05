package dev.codeplan.controller;

import dev.codeplan.model.Models.*;
import dev.codeplan.model.WorkspaceModels.*;
import dev.codeplan.service.*;
import jakarta.validation.Valid;
import java.io.IOException;
import java.time.*;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api")
public class ApiController {
    private final PlannerService planner;
    private final BackupService backup;
    private final Maintenance maintenance;
    public ApiController(PlannerService planner,BackupService backup,Maintenance maintenance) { this.planner=planner; this.backup=backup; this.maintenance=maintenance; }
    @GetMapping("/focus") public Map<String,Object> focus() { return planner.focus(); }
    @PostMapping("/focus") public dev.codeplan.model.FocusRecord startFocus(@RequestBody Map<String,String> input) { return planner.startFocus(input.get("taskId")); }
    @PostMapping("/focus/{id}/{action}") public dev.codeplan.model.FocusRecord controlFocus(@PathVariable String id,@PathVariable String action) { return planner.controlFocus(id,action); }
    @PutMapping("/focus/settings") public void focusSettings(@RequestBody Map<String,Integer> input) { planner.focusSettings(input.getOrDefault("minutes",25),input.getOrDefault("rest",5)); }
    @PostMapping("/focus/notifications") public List<String> focusNotifications() { return planner.claimFocusNotifications(); }
    @GetMapping("/weekly") public Map<String,Object> weekly(@RequestParam LocalDate day) { return planner.weekly(day); }
    @PutMapping("/weekly/{day}") public void saveWeek(@PathVariable LocalDate day,@Valid @RequestBody ReflectionInput input) { planner.saveWeek(day,input.content()); }
    @PostMapping("/categories") public Map<String,String> category(@Valid @RequestBody CustomCategory input) { return Map.of("id",planner.saveCategory(null,input)); }
    @PutMapping("/categories/{id}") public Map<String,String> category(@PathVariable String id,@Valid @RequestBody CustomCategory input) { return Map.of("id",planner.saveCategory(id,input)); }
    @PostMapping("/templates") public Map<String,String> template(@Valid @RequestBody TemplateInput input) { return Map.of("id",planner.saveTemplate(null,input)); }
    @PutMapping("/templates/{id}") public Map<String,String> template(@PathVariable String id,@Valid @RequestBody TemplateInput input) { return Map.of("id",planner.saveTemplate(id,input)); }
    @DeleteMapping("/templates/{id}") public void deleteTemplate(@PathVariable String id) { planner.deleteTemplate(id); }
    @GetMapping("/templates/{id}/preview") public List<TaskInput> previewTemplate(@PathVariable String id,@RequestParam LocalDate day) { return planner.previewTemplate(id,day); }
    @PostMapping("/templates/{id}/create") public List<String> createTemplate(@PathVariable String id,@RequestBody Map<String,String> input) { return planner.createFromTemplate(id,LocalDate.parse(input.get("day")),input.get("requestId")); }
    @GetMapping("/health") public Map<String,String> health() { return Map.of("status","ok","version","0.1.1"); }
    @GetMapping("/workspace") public Map<String,Object> workspace() { return planner.workspace(); }
    @GetMapping("/tasks") public List<Task> tasks() { return planner.tasks(); }
    @PostMapping("/tasks") public Task createTask(@Valid @RequestBody TaskInput input) { return planner.saveTask(null,input); }
    @PutMapping("/tasks/{id}") public Task updateTask(@PathVariable String id,@Valid @RequestBody TaskInput input) { return planner.saveTask(id,input); }
    @DeleteMapping("/tasks/{id}") public void deleteTask(@PathVariable String id) { planner.deleteTask(id); }
    @GetMapping("/trash") public List<Task> trash() { return planner.trash(); }
    @PostMapping("/trash/{id}/restore") public void restoreTask(@PathVariable String id) { planner.restoreTask(id); }
    @DeleteMapping("/trash/{id}") public void purgeTask(@PathVariable String id) { planner.purgeTask(id); }
    @GetMapping("/problems") public List<Problem> problems() { return planner.problems(); }
    @PostMapping("/problems") public Problem createProblem(@Valid @RequestBody ProblemInput input) { return planner.saveProblem(null,input); }
    @PutMapping("/problems/{id}") public Problem updateProblem(@PathVariable String id,@Valid @RequestBody ProblemInput input) { return planner.saveProblem(id,input); }
    @DeleteMapping("/problems/{id}") public void deleteProblem(@PathVariable String id) { planner.deleteProblem(id); }
    @GetMapping("/attempts") public List<Attempt> attempts() { return planner.attempts(); }
    @PostMapping("/attempts") public Attempt createAttempt(@Valid @RequestBody AttemptInput input) { return planner.saveAttempt(null,input); }
    @PutMapping("/attempts/{id}") public Attempt updateAttempt(@PathVariable String id,@Valid @RequestBody AttemptInput input) { return planner.saveAttempt(id,input); }
    @DeleteMapping("/attempts/{id}") public void deleteAttempt(@PathVariable String id) { planner.deleteAttempt(id); }
    @GetMapping("/reflections") public List<Reflection> reflections() { return planner.reflections(); }
    @PutMapping("/reflections/{day}") public void saveReflection(@PathVariable LocalDate day,@Valid @RequestBody ReflectionInput input) { planner.saveReflection(day,input.content()); }
    @GetMapping("/rules") public List<Rule> rules() { return planner.rules(); }
    @PostMapping("/rules") public Rule createRule(@Valid @RequestBody RuleInput input) { return planner.saveRule(null,input); }
    @PutMapping("/rules/{id}") public Rule updateRule(@PathVariable String id,@Valid @RequestBody RuleInput input) { return planner.saveRule(id,input); }
    @GetMapping("/settings") public Settings settings() { return planner.settings(); }
    @PutMapping("/settings") public Settings settings(@Valid @RequestBody SettingsInput input) { return planner.saveSettings(input); }
    @GetMapping("/statistics") public Map<String,Object> statistics(@RequestParam LocalDate from,@RequestParam LocalDate to) { return planner.statistics(from,to); }
    @GetMapping("/maintenance") public Map<String,Object> maintenance() { return Map.of("error",maintenance.error(),"backupDirectory",backup.directory().toString()); }
    @PostMapping("/reminders/claim") public List<Task> reminders() { return planner.claimReminders(LocalDateTime.now()); }
    @GetMapping("/backups") public List<Map<String,Object>> backups() { return backup.list(); }
    @PostMapping("/backups") public Map<String,String> createBackup() { return Map.of("name",backup.backup("manual").getFileName().toString()); }
    @GetMapping("/backups/{name}") public ResponseEntity<byte[]> download(@PathVariable String name) {
        return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=\""+name+"\"").contentType(MediaType.APPLICATION_OCTET_STREAM).body(backup.download(name));
    }
    @PostMapping("/restore/preview") public Map<String,Object> preview(@RequestParam MultipartFile file) throws IOException { return backup.preview(file.getBytes()); }
    @PostMapping("/restore") public Map<String,String> restore(@RequestBody Map<String,String> input) { return backup.restore(input.get("token")); }
}
