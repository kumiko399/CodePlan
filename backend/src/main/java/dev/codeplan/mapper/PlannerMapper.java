package dev.codeplan.mapper;

import dev.codeplan.model.Models.*;
import java.time.LocalDate;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface PlannerMapper {
    List<Task> tasks();
    Task task(String id);
    void insertTask(Task task);
    void updateTask(Task task);
    void deleteTask(String id);
    List<Problem> problems();
    Problem problem(String id);
    void insertProblem(Problem problem);
    void updateProblem(Problem problem);
    void deleteProblem(String id);
    List<Attempt> attempts();
    void insertAttempt(Attempt attempt);
    void deleteAttempt(String id);
    List<Reflection> reflections();
    void insertReflection(Reflection reflection);
    void deleteReflection(LocalDate day);
    List<Rule> rules();
    void insertRule(Rule rule);
    void updateRule(Rule rule);
    Settings settings();
    void updateSettings(Settings settings);
    void clearAttempts();
    void clearTasks();
    void clearRules();
    void clearProblems();
    void clearReflections();
}
