package dev.codeplan.model;

import java.time.*;
import java.util.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

public final class WorkspaceModels {
    private WorkspaceModels() {}
    public record Subtask(@NotBlank @Size(max=36) String id, @NotBlank @Size(max=200) String title, boolean done) {}
    public record TaskDetails(LocalDate deadlineDate,
        @Pattern(regexp="([01]\\d|2[0-3]):[0-5]\\d") String deadlineTime,
        @NotNull @Size(max=100) List<@Valid Subtask> subtasks, LocalDateTime deletedAt, @Size(max=16) String emoji) {
        public TaskDetails(LocalDate deadlineDate,String deadlineTime,List<Subtask> subtasks,LocalDateTime deletedAt) { this(deadlineDate,deadlineTime,subtasks,deletedAt,null); }
        public static TaskDetails empty() { return new TaskDetails(null,null,List.of(),null); }
    }
    public record ProblemDetails(@NotNull @Size(max=20000) String idea, @NotNull @Size(max=200) String timeComplexity,
        @NotNull @Size(max=200) String spaceComplexity, @NotNull @Size(max=20000) String pitfalls,
        @NotNull @Size(max=20000) String code, @NotNull @Pattern(regexp="text|java|javascript|python|cpp") String language,
        boolean favorite, boolean challenge) {
        public static ProblemDetails empty() { return new ProblemDetails("","","","","","text",false,false); }
    }
    public record CustomCategory(@NotBlank @Size(max=30) String name, @NotBlank @Size(max=16) String emoji,
        @Pattern(regexp="blue|green|orange|purple|rose|teal") @NotNull String color, boolean active) {}
    public record TemplateItem(@NotBlank @Size(max=100) String title, @NotNull @Pattern(regexp=Categories.INPUT_PATTERN) String category,
        @NotNull @Pattern(regexp="high|medium|low") String priority, @Size(max=20000) String notes, String problemId,
        @Min(-365) @Max(365) int offset, @NotNull @Size(max=100) List<@Valid Subtask> subtasks) {}
    public record TemplateInput(@NotBlank @Size(max=100) String name, @NotNull @Size(min=1,max=50) List<@Valid TemplateItem> items) {}
    public record TemplateReceipt(String templateId,LocalDate day,List<String> taskIds) {}
    public record Occurrence(String ruleId, LocalDate day) {}
    public record Reschedule(String taskId, LocalDate fromDate, LocalDate toDate, LocalDateTime changedAt) {}
}
