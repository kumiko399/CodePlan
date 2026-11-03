package dev.codeplan.model;

import dev.codeplan.mapper.ExtraMapper.Row;
import dev.codeplan.model.WorkspaceModels.TaskDetails;
import dev.codeplan.model.WorkspaceModels.Subtask;
import dev.codeplan.model.WorkspaceModels.ProblemDetails;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import jakarta.validation.constraints.*;

/** Persisted records are separate from validated HTTP input. IDs are UUIDs. */
public final class Models {
    private Models() {}
    public record Task(String id, String title, String category, LocalDate planDate, String taskTime,
        String priority, String notes, String status, LocalDateTime completedAt, String problemId,
        String ruleId, LocalDate occurrenceDate, String reminderTime, boolean notified) {}
    public record Problem(String id, String platform, String number, String title, String url,
        String difficulty, String tags, String notes, String identityKey) {}
    public record Attempt(String id, String problemId, String taskId, LocalDateTime attemptedAt,
        String result, Integer minutes, String notes) {}
    public record Reflection(LocalDate day, String content) {}
    public record Rule(String id, String title, String category, String priority, String notes,
        String taskTime, String reminderTime, LocalDate startDate, LocalDate endDate,
        String frequency, String weekdays, String problemId, boolean active, LocalDate cursorDate) {}
    public record Settings(int id, String language, String theme, String color, boolean repeatEnabled,
        boolean remindersEnabled, boolean autoBackup, String backupDirectory, LocalDate lastAutoBackup) {}
    public record Snapshot(int version, LocalDateTime createdAt, List<Task> tasks, List<Problem> problems,
        List<Attempt> attempts, List<Reflection> reflections, List<Rule> rules, Preferences preferences, List<Row> extras) {
        public Snapshot(int version, LocalDateTime createdAt, List<Task> tasks, List<Problem> problems, List<Attempt> attempts, List<Reflection> reflections, List<Rule> rules, Preferences preferences) {
            this(version,createdAt,tasks,problems,attempts,reflections,rules,preferences,List.of());
        }
    }
    public record Preferences(String language, String theme, String color, boolean repeatEnabled,
        boolean remindersEnabled, boolean autoBackup) {}
    public record TaskInput(@NotBlank @Size(max=100) String title,
        @NotNull @Pattern(regexp=Categories.INPUT_PATTERN) String category, @NotNull LocalDate planDate,
        @Pattern(regexp="([01]\\d|2[0-3]):[0-5]\\d") String taskTime,
        @NotNull @Pattern(regexp="high|medium|low") String priority, @Size(max=20000) String notes,
        @NotNull @Pattern(regexp="todo|doing|done") String status, String problemId,
        @Pattern(regexp="([01]\\d|2[0-3]):[0-5]\\d") String reminderTime, @Valid TaskDetails details, boolean confirmIncomplete) {
        public TaskInput(String title,String category,LocalDate planDate,String taskTime,String priority,String notes,String status,String problemId,String reminderTime) {
            this(title,category,planDate,taskTime,priority,notes,status,problemId,reminderTime,null,false);
        }
    }
    public record ProblemInput(@NotBlank @Size(max=80) String platform, @Size(max=50) String number,
        @NotBlank @Size(max=200) String title, @Size(max=1000) String url,
        @NotNull @Pattern(regexp="easy|medium|hard|unset") String difficulty,
        @Size(max=1000) String tags, @Size(max=20000) String notes, @Valid ProblemDetails details) {
        public ProblemInput(String platform,String number,String title,String url,String difficulty,String tags,String notes) { this(platform,number,title,url,difficulty,tags,notes,null); }
    }
    public record AttemptInput(@NotBlank String problemId, String taskId, @NotNull LocalDateTime attemptedAt,
        @NotNull @Pattern(regexp="passed|failed") String result, @Min(0) @Max(10080) Integer minutes,
        @Size(max=20000) String notes) {}
    public record ReflectionInput(@Size(max=20000) String content) {}
    public record RuleInput(@NotBlank @Size(max=100) String title,
        @NotNull @Pattern(regexp=Categories.INPUT_PATTERN) String category,
        @NotNull @Pattern(regexp="high|medium|low") String priority, @Size(max=20000) String notes,
        @Pattern(regexp="([01]\\d|2[0-3]):[0-5]\\d") String taskTime,
        @Pattern(regexp="([01]\\d|2[0-3]):[0-5]\\d") String reminderTime,
        @NotNull LocalDate startDate, LocalDate endDate,
        @NotNull @Pattern(regexp="daily|weekly") String frequency,
        @NotNull @Pattern(regexp="[1-7](,[1-7])*|^$") String weekdays, String problemId, boolean active, @Size(max=100) List<@Valid Subtask> subtasks) {
        public RuleInput(String title,String category,String priority,String notes,String taskTime,String reminderTime,LocalDate startDate,LocalDate endDate,String frequency,String weekdays,String problemId,boolean active) {
            this(title,category,priority,notes,taskTime,reminderTime,startDate,endDate,frequency,weekdays,problemId,active,null);
        }
    }
    public record SettingsInput(@NotNull @Pattern(regexp="zh|en") String language,
        @NotNull @Pattern(regexp="light|dark|system") String theme,
        @NotNull @Pattern(regexp="blue|green|purple|orange") String color,
        boolean repeatEnabled, boolean remindersEnabled, boolean autoBackup,
        @NotNull @Size(max=2000) String backupDirectory) {}
}
