package dev.codeplan.service;

import dev.codeplan.mapper.PlannerMapper;
import dev.codeplan.mapper.ExtraMapper.Row;
import dev.codeplan.model.WorkspaceModels.*;
import dev.codeplan.model.FocusRecord;
import dev.codeplan.model.Models.*;
import jakarta.validation.Validator;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import java.util.function.Supplier;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** All local writes share this lock; the transaction commits before the lock is released. */
@Service
public class PlannerService {
    private final PlannerMapper db;
    private final TransactionTemplate tx;
    private final Validator validator;
    private final ExtraStore extra;
    private final String bootId=UUID.randomUUID().toString();
    public PlannerService(PlannerMapper db, TransactionTemplate tx, Validator validator, ExtraStore extra) {
        this.db = db; this.tx = tx; this.validator = validator; this.extra = extra;
    }
    public synchronized <T> T exclusive(Supplier<T> operation) { return operation.get(); }
    private <T> T write(Supplier<T> operation) { return tx.execute(s -> operation.get()); }
    private static String id() { return UUID.randomUUID().toString(); }
    private static String text(String value) { return value == null ? "" : value.trim(); }
    private static String nullable(String value) { return text(value).isEmpty() ? null : value.trim(); }
    private void valid(Object input) {
        if (input == null || !validator.validate(input).isEmpty()) throw new IllegalArgumentException("INVALID_INPUT");
    }
    private Task requireTask(String id) {
        Task task = db.task(id); if (task == null || details(id).deletedAt()!=null) throw new NoSuchElementException("TASK_NOT_FOUND"); return task;
    }
    private void checkCategory(String category, String previous) {
        if(dev.codeplan.model.Categories.IDS.contains(category)) return;
        CustomCategory c=extra.get("category",category,CustomCategory.class,null);
        if(c==null || (!c.active() && !category.equals(previous))) throw new IllegalArgumentException("CATEGORY_UNAVAILABLE");
    }
    private void checkProblem(String problemId, String category) {
        if (problemId != null && (db.problem(problemId) == null || !category.equals("algorithm")))
            throw new IllegalArgumentException("INVALID_PROBLEM");
    }
    public synchronized Map<String,Object> workspace() { return write(() -> Map.of("databaseId",extra.meta("databaseId"),"epoch",extra.meta("epoch"),"extras",extra.all())); }
    private TaskDetails details(String id) { return extra.get("task",id,TaskDetails.class,TaskDetails.empty()); }
    private void validDetails(TaskDetails d) {
        valid(d);
        if(d.emoji()!=null && !Set.of("","📚","🏫","🧠","📝","📄","🎯","✍️","💻","🛠️","🧩","🐛","🏃","🏀","🏠","🧺","🎭","🎤","🤝","🎂","🍽️","🥗","🌙","😴","📖","📑","💼","👔").contains(d.emoji())) throw new IllegalArgumentException("INVALID_INPUT");
        if(d.deadlineTime()!=null && d.deadlineDate()==null) throw new IllegalArgumentException("DEADLINE_DATE_REQUIRED");
        if(d.subtasks().stream().map(Subtask::id).distinct().count()!=d.subtasks().size()) throw new IllegalArgumentException("INVALID_INPUT");
    }
    public synchronized List<Task> tasks() { return db.tasks().stream().filter(t->details(t.id()).deletedAt()==null).toList(); }
    public synchronized List<Task> trash() { return db.tasks().stream().filter(t->details(t.id()).deletedAt()!=null).toList(); }
    public synchronized List<Problem> problems() { return db.problems(); }
    public synchronized List<Attempt> attempts() { return db.attempts(); }
    public synchronized List<Reflection> reflections() { return db.reflections(); }
    public synchronized List<Rule> rules() { return db.rules(); }
    public synchronized Settings settings() { return db.settings(); }

    public synchronized Task saveTask(String existingId, TaskInput input) {
        valid(input);
        return write(() -> {
            Task old = existingId == null ? null : requireTask(existingId);
            TaskDetails detail = input.details()!=null ? input.details() : old==null ? TaskDetails.empty() : details(old.id());
            validDetails(detail);
            if(input.status().equals("done") && (old==null || !old.status().equals("done")) && detail.subtasks().stream().anyMatch(s->!s.done()) && !input.confirmIncomplete()) throw new IllegalArgumentException("INCOMPLETE_SUBTASKS");
            if(detail.deletedAt()!=null) throw new IllegalArgumentException("INVALID_INPUT");
            checkCategory(input.category(),old==null?null:old.category());
            String problemId = nullable(input.problemId());
            checkProblem(problemId, input.category());
            if (problemId != null && tasks().stream().anyMatch(t -> !Objects.equals(t.id(), existingId)
                && problemId.equals(t.problemId()) && input.planDate().equals(t.planDate())))
                throw new IllegalArgumentException("DUPLICATE_PLAN");
            LocalDateTime completed = input.status().equals("done")
                ? old != null && old.completedAt() != null ? old.completedAt() : LocalDateTime.now() : null;
            boolean notified = old != null && old.notified() && old.planDate().equals(input.planDate())
                && Objects.equals(old.reminderTime(), input.reminderTime());
            Task task = new Task(old == null ? id() : old.id(), input.title().trim(), input.category(), input.planDate(),
                input.taskTime(), input.priority(), text(input.notes()), input.status(), completed, problemId,
                old == null ? null : old.ruleId(), old == null ? null : old.occurrenceDate(), input.reminderTime(), notified);
            if (old == null) db.insertTask(task); else db.updateTask(task);
            extra.put("task",task.id(),detail);
            if(old!=null && !old.planDate().equals(task.planDate())) extra.put("reschedule",id(),new Reschedule(task.id(),old.planDate(),task.planDate(),LocalDateTime.now()));
            return task;
        });
    }
    public synchronized void deleteTask(String id) { write(() -> {
        Task task=requireTask(id); TaskDetails d=details(id);
        if(focusRecords().stream().anyMatch(f->id.equals(f.taskId) && f.active())) throw new IllegalArgumentException("FOCUS_ACTIVE");
        extra.put("task",id,new TaskDetails(d.deadlineDate(),d.deadlineTime(),d.subtasks(),LocalDateTime.now(),d.emoji()));
        if(task.ruleId()!=null) extra.put("tombstone",occurrenceKey(task.ruleId(),task.occurrenceDate()),new Occurrence(task.ruleId(),task.occurrenceDate()));
        return null;
    }); }
    private String occurrenceKey(String rule,LocalDate day) { return UUID.nameUUIDFromBytes((rule+":"+day).getBytes(StandardCharsets.UTF_8)).toString(); }
    public synchronized void restoreTask(String id) { write(() -> {
        Task task=db.task(id); if(task==null || details(id).deletedAt()==null) throw new NoSuchElementException("TASK_NOT_FOUND");
        if(task.problemId()!=null && tasks().stream().anyMatch(t->task.problemId().equals(t.problemId()) && task.planDate().equals(t.planDate()))) throw new IllegalArgumentException("DUPLICATE_PLAN");
        TaskDetails d=details(id); extra.put("task",id,new TaskDetails(d.deadlineDate(),d.deadlineTime(),d.subtasks(),null,d.emoji()));
        boolean oldReminder=task.reminderTime()!=null && !LocalDateTime.of(task.planDate(),LocalTime.parse(task.reminderTime())).isAfter(LocalDateTime.now());
        db.updateTask(new Task(task.id(),task.title(),task.category(),task.planDate(),task.taskTime(),task.priority(),task.notes(),task.status(),task.completedAt(),task.problemId(),task.ruleId(),task.occurrenceDate(),task.reminderTime(),task.notified()||oldReminder));
        return null;
    }); }
    public synchronized void purgeTask(String id) { write(() -> {
        if(db.task(id)==null || details(id).deletedAt()==null) throw new NoSuchElementException("TASK_NOT_FOUND");
        db.deleteTask(id); extra.delete("task",id); return null;
    }); }
    public synchronized Problem saveProblem(String existingId, ProblemInput input) {
        valid(input);
        return write(() -> {
            if (existingId != null && db.problem(existingId) == null) throw new NoSuchElementException("PROBLEM_NOT_FOUND");
            String url = normalizeUrl(input.url());
            String key = identity(input.platform(), input.number(), url);
            if (db.problems().stream().anyMatch(p -> !Objects.equals(p.id(), existingId)
                && ((key != null && key.equals(p.identityKey())) || (!url.isEmpty() && url.equals(p.url())))))
                throw new IllegalArgumentException("DUPLICATE_PROBLEM");
            Problem p = new Problem(existingId == null ? id() : existingId, input.platform().trim(), text(input.number()),
                input.title().trim(), url, input.difficulty(), text(input.tags()), text(input.notes()), key);
            if (existingId == null) db.insertProblem(p); else db.updateProblem(p);
            ProblemDetails detail=input.details()==null?extra.get("problem",p.id(),ProblemDetails.class,ProblemDetails.empty()):input.details(); valid(detail); extra.put("problem",p.id(),detail);
            return p;
        });
    }
    public static String normalizeUrl(String value) {
        if (text(value).isEmpty()) return "";
        try {
            URI uri = URI.create(value.trim());
            if (!Set.of("http", "https").contains(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null)
                throw new IllegalArgumentException();
            return new URI(uri.getScheme(), null, uri.getHost().toLowerCase(Locale.ROOT), uri.getPort(),
                uri.getPath().replaceAll("/+$", ""), null, null).toASCIIString();
        } catch (Exception e) { throw new IllegalArgumentException("INVALID_URL"); }
    }
    private static String identity(String platform, String number, String url) {
        String value = !text(number).isEmpty() ? platform.trim().toLowerCase(Locale.ROOT) + ":" + number.trim()
            : !text(url).isEmpty() ? url : null;
        if (value == null) return null;
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }
    public synchronized void deleteProblem(String id) {
        write(() -> {
            if (db.problem(id) == null) throw new NoSuchElementException("PROBLEM_NOT_FOUND");
            if (db.tasks().stream().anyMatch(t -> id.equals(t.problemId())) || db.attempts().stream().anyMatch(a -> id.equals(a.problemId()))
                || db.rules().stream().anyMatch(r -> id.equals(r.problemId()))) throw new IllegalArgumentException("PROBLEM_IN_USE");
            if(extra.all().stream().filter(r->r.kind().equals("template")).map(r->extra.read(r.payload(),TemplateInput.class)).anyMatch(template->template.items().stream().anyMatch(item->id.equals(item.problemId())))) throw new IllegalArgumentException("PROBLEM_IN_USE");
            db.deleteProblem(id); extra.delete("problem",id); return null;
        });
    }
    public synchronized Attempt saveAttempt(String existingId, AttemptInput input) {
        valid(input);
        return write(() -> {
            if (db.problem(input.problemId()) == null) throw new IllegalArgumentException("INVALID_PROBLEM");
            if (input.attemptedAt().isAfter(LocalDateTime.now().plusMinutes(1))) throw new IllegalArgumentException("FUTURE_ATTEMPT");
            Task task = nullable(input.taskId()) == null ? null : requireTask(input.taskId());
            if (task != null && !input.problemId().equals(task.problemId())) throw new IllegalArgumentException("INVALID_PROBLEM");
            if (existingId != null) {
                if (db.attempts().stream().noneMatch(a -> a.id().equals(existingId))) throw new NoSuchElementException("ATTEMPT_NOT_FOUND");
                db.deleteAttempt(existingId);
            }
            Attempt attempt = new Attempt(existingId == null ? id() : existingId, input.problemId(), nullable(input.taskId()),
                input.attemptedAt(), input.result(), input.minutes(), text(input.notes()));
            db.insertAttempt(attempt);
            if (task != null && existingId == null) {
                String status = task.status().equals("done") || (input.result().equals("passed") && details(task.id()).subtasks().stream().allMatch(Subtask::done)) ? "done" : "doing";
                db.updateTask(new Task(task.id(), task.title(), task.category(), task.planDate(), task.taskTime(), task.priority(), task.notes(), status,
                    status.equals("done") ? task.completedAt() == null ? input.attemptedAt() : task.completedAt() : null,
                    task.problemId(), task.ruleId(), task.occurrenceDate(), task.reminderTime(), task.notified()));
            }
            return attempt;
        });
    }
    public synchronized void deleteAttempt(String id) { write(() -> { db.deleteAttempt(id); return null; }); }
    public synchronized void saveReflection(LocalDate day, String content) {
        valid(new ReflectionInput(content));
        write(() -> { db.deleteReflection(day); if (!text(content).isEmpty()) db.insertReflection(new Reflection(day, content.trim())); return null; });
    }

    public synchronized Rule saveRule(String existingId, RuleInput input) {
        valid(input);
        if (input.endDate() != null && input.endDate().isBefore(input.startDate())) throw new IllegalArgumentException("INVALID_DATE_RANGE");
        if (input.frequency().equals("weekly") && input.weekdays().isBlank()) throw new IllegalArgumentException("WEEKDAYS_REQUIRED");
        return write(() -> {
            checkCategory(input.category(),existingId==null?null:db.rules().stream().filter(r->r.id().equals(existingId)).map(Rule::category).findFirst().orElse(null));
            checkProblem(nullable(input.problemId()), input.category());
            if (existingId != null && db.rules().stream().noneMatch(r -> r.id().equals(existingId))) throw new NoSuchElementException("RULE_NOT_FOUND");
            LocalDate today = LocalDate.now();
            Rule rule = new Rule(existingId == null ? id() : existingId, input.title().trim(), input.category(), input.priority(), text(input.notes()),
                input.taskTime(), input.reminderTime(), input.startDate(), input.endDate(), input.frequency(), input.weekdays(), nullable(input.problemId()), input.active(), today.minusDays(1));
            if (existingId == null) db.insertRule(rule); else {
                // Only unfinished instances from today onward are replaced. Completed history stays untouched.
                for (Task t : tasks()) if (existingId.equals(t.ruleId()) && !t.planDate().isBefore(today) && !t.status().equals("done")) { db.deleteTask(t.id()); extra.delete("task",t.id()); }
                db.updateRule(rule);
            }
            TaskDetails structure = new TaskDetails(null,null,input.subtasks()==null ? extra.get("rule",rule.id(),TaskDetails.class,TaskDetails.empty()).subtasks() : input.subtasks().stream().map(s->new Subtask(s.id(),s.title(),false)).toList(),null);
            validDetails(structure); extra.put("rule",rule.id(),structure);
            generateInternal(today); return rule;
        });
    }
    private Rule cursor(Rule r, LocalDate date) {
        return new Rule(r.id(), r.title(), r.category(), r.priority(), r.notes(), r.taskTime(), r.reminderTime(), r.startDate(), r.endDate(), r.frequency(), r.weekdays(), r.problemId(), r.active(), date);
    }
    public synchronized void generate(LocalDate today) { write(() -> { generateInternal(today); return null; }); }
    private void generateInternal(LocalDate today) {
        if (!db.settings().repeatEnabled()) return;
        LocalDate horizon = today.plusDays(29);
        List<Task> tasks = new ArrayList<>(db.tasks());
        for (Rule rule : db.rules()) {
            if (!rule.active()) continue;
            if(!dev.codeplan.model.Categories.IDS.contains(rule.category()) && !extra.get("category",rule.category(),CustomCategory.class,new CustomCategory("?","?","blue",false)).active()) continue;
            LocalDate from = rule.cursorDate() == null ? today : rule.cursorDate().plusDays(1);
            if (from.isBefore(rule.startDate())) from = rule.startDate();
            LocalDate end = rule.endDate() != null && rule.endDate().isBefore(horizon) ? rule.endDate() : horizon;
            if (from.isBefore(today.minusYears(1))) from = today.minusYears(1); // bound first catch-up after very long inactivity
            for (LocalDate date = from; !date.isAfter(end); date = date.plusDays(1)) {
                if (rule.frequency().equals("weekly") && !Arrays.asList(rule.weekdays().split(",")).contains("" + date.getDayOfWeek().getValue())) continue;
                final LocalDate occurrence = date;
                if(extra.get("tombstone",occurrenceKey(rule.id(),date),Occurrence.class,null)!=null) continue;
                if (tasks.stream().anyMatch(t -> (rule.id().equals(t.ruleId()) && occurrence.equals(t.occurrenceDate()))
                    || (rule.problemId() != null && rule.problemId().equals(t.problemId()) && occurrence.equals(t.planDate())))) continue;
                Task t = new Task(id(), rule.title(), rule.category(), date, rule.taskTime(), rule.priority(), rule.notes(), "todo", null,
                    rule.problemId(), rule.id(), date, rule.reminderTime(), false);
                db.insertTask(t); tasks.add(t);
                var structure=extra.get("rule",rule.id(),TaskDetails.class,TaskDetails.empty());
                extra.put("task",t.id(),new TaskDetails(null,null,structure.subtasks().stream().map(s->new Subtask(id(),s.title(),false)).toList(),null));
            }
            if (rule.cursorDate() == null || horizon.isAfter(rule.cursorDate())) db.updateRule(cursor(rule, horizon));
        }
    }
    public synchronized Settings saveSettings(SettingsInput input) {
        valid(input);
        return write(() -> {
            Settings old = db.settings();
            if (!old.repeatEnabled() && input.repeatEnabled()) {
                for (Rule rule : db.rules()) if (rule.cursorDate() == null || rule.cursorDate().isBefore(LocalDate.now().minusDays(1)))
                    db.updateRule(cursor(rule, LocalDate.now().minusDays(1)));
            }
            Settings s = new Settings(1, input.language(), input.theme(), input.color(), input.repeatEnabled(), input.remindersEnabled(),
                input.autoBackup(), input.backupDirectory().trim(), old.lastAutoBackup());
            db.updateSettings(s); generateInternal(LocalDate.now()); return s;
        });
    }
    public synchronized void markAutoBackup(LocalDate day) {
        write(() -> { Settings s = db.settings(); db.updateSettings(new Settings(1,s.language(),s.theme(),s.color(),s.repeatEnabled(),s.remindersEnabled(),s.autoBackup(),s.backupDirectory(),day)); return null; });
    }
    public synchronized List<Task> claimReminders(LocalDateTime now) {
        return write(() -> {
            if (!db.settings().remindersEnabled()) return List.of();
            List<Task> due = tasks().stream().filter(t -> !t.notified() && !t.status().equals("done") && t.reminderTime() != null
                && !LocalDateTime.of(t.planDate(), LocalTime.parse(t.reminderTime())).isAfter(now)).toList();
            for (Task t : due) db.updateTask(new Task(t.id(),t.title(),t.category(),t.planDate(),t.taskTime(),t.priority(),t.notes(),t.status(),t.completedAt(),t.problemId(),t.ruleId(),t.occurrenceDate(),t.reminderTime(),true));
            return due;
        });
    }
    public synchronized Map<String,Object> statistics(LocalDate from, LocalDate to) {
        if (from.isAfter(to) || from.plusYears(5).isBefore(to)) throw new IllegalArgumentException("INVALID_DATE_RANGE");
        List<Task> selected = tasks().stream().filter(t -> !t.planDate().isBefore(from) && !t.planDate().isAfter(to)).toList();
        List<Attempt> attempts = db.attempts().stream().filter(a -> !a.attemptedAt().toLocalDate().isBefore(from) && !a.attemptedAt().toLocalDate().isAfter(to)).toList();
        Set<String> passed = attempts.stream().filter(a -> a.result().equals("passed")).map(Attempt::problemId).collect(Collectors.toSet());
        Map<String,Long> difficulty = new LinkedHashMap<>(), tags = new LinkedHashMap<>();
        for (Problem p : db.problems()) if (passed.contains(p.id())) {
            difficulty.merge(p.difficulty(),1L,Long::sum);
            Arrays.stream(p.tags().split("[,，]")).map(String::trim).filter(s -> !s.isBlank()).distinct().forEach(s -> tags.merge(s,1L,Long::sum));
        }
        List<Map<String,Object>> trend = new ArrayList<>();
        for (LocalDate day = from; !day.isAfter(to); day = day.plusDays(1)) {
            final LocalDate d = day;
            List<Attempt> daily = attempts.stream().filter(a -> a.attemptedAt().toLocalDate().equals(d)).toList();
            trend.add(Map.of("day",day,"attempts",daily.size(),"passed",daily.stream().filter(a -> a.result().equals("passed")).map(Attempt::problemId).distinct().count()));
        }
        List<Map<String,Object>> categories = new ArrayList<>();
        List<String> categoryIds=new ArrayList<>(dev.codeplan.model.Categories.IDS);
        extra.all().stream().filter(r->r.kind().equals("category")).map(Row::recordId).forEach(categoryIds::add);
        for (String category : categoryIds) {
            List<Task> group = selected.stream().filter(t -> t.category().equals(category)).toList();
            categories.add(Map.of("category",category,"total",group.size(),"completed",group.stream().filter(t -> t.status().equals("done")).count()));
        }
        return Map.of("total",selected.size(),"completed",selected.stream().filter(t -> t.status().equals("done")).count(),
            "attempts",attempts.size(),"passed",passed.size(),"difficulty",difficulty,"tags",tags,"trend",trend,"categories",categories);
    }

    private List<FocusRecord> focusRecords() { return extra.all().stream().filter(r->r.kind().equals("focus")).map(r->extra.read(r.payload(),FocusRecord.class)).toList(); }
    public synchronized Map<String,Object> focus() {
        tickFocus(LocalDateTime.now());
        return Map.of("records",focusRecords(),"preferences",extra.get("focusSettings","settings",int[].class,new int[]{25,5}));
    }
    public synchronized void focusSettings(int minutes,int rest) { write(()->{
        if(minutes<1 || minutes>180 || rest<1 || rest>60) throw new IllegalArgumentException("INVALID_INPUT");
        extra.put("focusSettings","settings",new int[]{minutes,rest}); return null;
    }); }
    public synchronized FocusRecord startFocus(String taskId) { return write(()->{
        Task task=requireTask(taskId);
        if(focusRecords().stream().anyMatch(FocusRecord::active)) throw new IllegalArgumentException("FOCUS_ACTIVE");
        int[] preferences=extra.get("focusSettings","settings",int[].class,new int[]{25,5});
        FocusRecord f=new FocusRecord(); f.id=id(); f.taskId=taskId; f.title=task.title(); f.status="running"; f.boot=bootId;
        f.focusMinutes=preferences[0]; f.restMinutes=preferences[1]; f.startedAt=f.lastTick=f.phaseStart=LocalDateTime.now();
        extra.put("focus",f.id,f); return f;
    }); }
    public synchronized void tickFocus(LocalDateTime now) { write(()->{
        for(FocusRecord f:focusRecords()) if(f.active()) { FocusClock.tick(f,now,bootId); extra.put("focus",f.id,f); }
        return null;
    }); }
    public synchronized FocusRecord controlFocus(String id,String action) { return write(()->{
        FocusRecord f=extra.get("focus",id,FocusRecord.class,null);
        if(f==null) throw new NoSuchElementException("FOCUS_NOT_FOUND");
        if(!f.active()) return f;
        FocusClock.tick(f,LocalDateTime.now(),bootId);
        switch(action) {
            case "pause" -> { if(f.status.equals("running")) f.status="paused"; }
            case "resume" -> {
                if(f.status.equals("paused") || f.status.equals("interrupted")) {
                    f.status=f.seconds()>=f.focusMinutes*60L?"rest":"running";
                    f.lastTick=f.phaseStart=LocalDateTime.now(); f.boot=bootId;
                }
            }
            case "finish" -> { f.outcome=f.seconds()>=f.focusMinutes*60L?"complete":"interrupted"; f.status="finished"; f.endedAt=f.lastTick; f.notifyPending=false; }
            case "cancel" -> { f.outcome="cancelled"; f.status="cancelled"; f.endedAt=f.lastTick; f.notifyPending=false; }
            default -> throw new IllegalArgumentException("INVALID_INPUT");
        }
        extra.put("focus",id,f); return f;
    }); }
    public synchronized List<String> claimFocusNotifications() { return write(()->{
        List<String> messages=new ArrayList<>();
        for(FocusRecord f:focusRecords()) if(f.notifyPending) {
            if(db.settings().remindersEnabled()) messages.add(f.status.equals("rest")?"专注结束，休息一下 / Focus finished. Take a break.":"休息结束 / Break finished.");
            f.notifyPending=false; extra.put("focus",f.id,f);
        }
        return messages;
    }); }
    public synchronized Map<String,Object> weekly(LocalDate day) {
        LocalDate from=day.minusDays(day.getDayOfWeek().getValue()-1), to=from.plusDays(6);
        Map<String,Object> result=new LinkedHashMap<>(statistics(from,to));
        long seconds=0; for(FocusRecord f:focusRecords()) for(LocalDate d=from;!d.isAfter(to);d=d.plusDays(1)) seconds+=FocusClock.secondsOn(f,d);
        List<Reschedule> changes=extra.all().stream().filter(r->r.kind().equals("reschedule")).map(r->extra.read(r.payload(),Reschedule.class)).filter(r->!r.changedAt().toLocalDate().isBefore(from)&&!r.changedAt().toLocalDate().isAfter(to)).toList();
        List<Map<String,Object>> focusHistory=new ArrayList<>();
        for(FocusRecord f:focusRecords()) {
            long duration=0;for(LocalDate d=from;!d.isAfter(to);d=d.plusDays(1)) duration+=FocusClock.secondsOn(f,d);
            if(duration>0) focusHistory.add(Map.of("title",f.title,"startedAt",f.startedAt,"endedAt",f.endedAt==null?"":f.endedAt.toString(),"seconds",duration,"outcome",f.outcome==null?f.status:f.outcome));
        }
        result.put("focusHistory",focusHistory);
        result.put("from",from);result.put("to",to);result.put("focusSeconds",seconds);result.put("reschedules",changes);
        result.put("unfinished",tasks().stream().filter(t->!t.planDate().isBefore(from)&&!t.planDate().isAfter(to)&&!t.status().equals("done")).toList());
        result.put("review",extra.get("week",from.toString(),Reflection.class,new Reflection(from,"")).content());
        return result;
    }
    public synchronized void saveWeek(LocalDate day,String content) {
        valid(new ReflectionInput(content));
        if(day.getDayOfWeek()!=DayOfWeek.MONDAY) throw new IllegalArgumentException("INVALID_INPUT");
        write(()->{extra.put("week",day.toString(),new Reflection(day,content==null?"":content));return null;});
    }

    public synchronized String saveCategory(String existing,CustomCategory input) { valid(input); return write(()->{
        if(existing!=null && extra.get("category",existing,CustomCategory.class,null)==null) throw new NoSuchElementException("CATEGORY_NOT_FOUND");
        String key=existing==null?"c_"+id().replace("-","").substring(0,16):existing;
        extra.put("category",key,input); return key;
    }); }
    public synchronized String saveTemplate(String existing,TemplateInput input) { valid(input); return write(()->{
        if(existing!=null && extra.get("template",existing,TemplateInput.class,null)==null) throw new NoSuchElementException("TEMPLATE_NOT_FOUND");
        for(TemplateItem item:input.items()) { checkCategory(item.category(),item.category()); checkProblem(nullable(item.problemId()),item.category()); validDetails(new TaskDetails(null,null,item.subtasks(),null)); }
        String key=existing==null?id():existing; extra.put("template",key,input); return key;
    }); }
    public synchronized void deleteTemplate(String id) { write(()->{extra.delete("template",id);return null;}); }
    public synchronized List<TaskInput> previewTemplate(String id,LocalDate day) {
        TemplateInput template=extra.get("template",id,TemplateInput.class,null);
        if(template==null || day==null) throw new IllegalArgumentException("INVALID_INPUT");
        Set<String> daily=new HashSet<>(); List<TaskInput> result=new ArrayList<>();
        for(TemplateItem item:template.items()) {
            checkCategory(item.category(),null); checkProblem(nullable(item.problemId()),item.category());
            LocalDate date=day.plusDays(item.offset()); String problem=nullable(item.problemId());
            if(problem!=null && (!daily.add(problem+date) || tasks().stream().anyMatch(t->problem.equals(t.problemId()) && date.equals(t.planDate())))) throw new IllegalArgumentException("DUPLICATE_PLAN");
            result.add(new TaskInput(item.title(),item.category(),date,null,item.priority(),item.notes(),"todo",problem,null,
                new TaskDetails(null,null,item.subtasks().stream().map(s->new Subtask(id(),s.title(),false)).toList(),null),false));
        }
        return result;
    }
    public synchronized List<String> createFromTemplate(String templateId,LocalDate day,String requestId) { return write(()->{
        if(requestId==null || !UUID.fromString(requestId).toString().equals(requestId)) throw new IllegalArgumentException("INVALID_INPUT");
        TemplateReceipt previous=extra.get("request",requestId,TemplateReceipt.class,null);
        if(previous!=null) { if(!Objects.equals(previous.templateId(),templateId) || !Objects.equals(previous.day(),day)) throw new IllegalArgumentException("REQUEST_CONFLICT");return previous.taskIds(); }
        List<TaskInput> inputs=previewTemplate(templateId,day); List<String> ids=new ArrayList<>();
        for(TaskInput input:inputs) ids.add(saveTask(null,input).id());
        extra.put("request",requestId,new TemplateReceipt(templateId,day,ids));return ids;
    }); }
    public synchronized Snapshot snapshot() {
        return write(() -> { Settings s = db.settings(); return new Snapshot(2, LocalDateTime.now(), db.tasks(), db.problems(), db.attempts(), db.reflections(), db.rules(),
            new Preferences(s.language(),s.theme(),s.color(),s.repeatEnabled(),s.remindersEnabled(),s.autoBackup()),extra.all()); });
    }
    public void validateSnapshot(Snapshot s) {
        if (s == null || (s.version() != 1 && s.version() != 2) || s.createdAt() == null || s.tasks() == null || s.problems() == null || s.attempts() == null || s.reflections() == null || s.rules() == null || s.preferences() == null)
            throw new IllegalArgumentException("INVALID_BACKUP");
        if(s.version()==2 && s.extras()==null) throw new IllegalArgumentException("INVALID_BACKUP");
        Preferences p = s.preferences(); valid(new SettingsInput(p.language(),p.theme(),p.color(),p.repeatEnabled(),p.remindersEnabled(),p.autoBackup(),""));
        Set<String> tasks = uniqueIds(s.tasks().stream().map(Task::id).toList());
        Set<String> problems = uniqueIds(s.problems().stream().map(Problem::id).toList());
        Set<String> rules = uniqueIds(s.rules().stream().map(Rule::id).toList());
        uniqueIds(s.attempts().stream().map(Attempt::id).toList());
        Set<String> categoryIds=new HashSet<>(dev.codeplan.model.Categories.IDS);
        for(Row row:s.extras()==null?List.<Row>of():s.extras()) if("category".equals(row.kind())) {
            if(row.recordId()==null || !row.recordId().matches("c_[a-f0-9]{16}")) throw new IllegalArgumentException("INVALID_BACKUP");
            valid(extra.read(row.payload(),CustomCategory.class));categoryIds.add(row.recordId());
        }
        if(s.tasks().stream().anyMatch(t->!categoryIds.contains(t.category())) || s.rules().stream().anyMatch(r->!categoryIds.contains(r.category()))) throw new IllegalArgumentException("INVALID_BACKUP");
        Set<String> extraKeys=new HashSet<>();
        for(Row row:s.extras()==null?List.<Row>of():s.extras()) {
            if(s.version()==1 || row.kind()==null || row.recordId()==null || row.recordId().length()>36 || row.payload()==null || !extraKeys.add(row.kind()+":"+row.recordId())) throw new IllegalArgumentException("INVALID_BACKUP");
            if(!Set.of("category","week","focusSettings").contains(row.kind())) uniqueIds(List.of(row.recordId()));
            if(row.kind().equals("task")) {
                if(!tasks.contains(row.recordId())) throw new IllegalArgumentException("INVALID_BACKUP");
                validDetails(extra.read(row.payload(),TaskDetails.class));
            } else if(row.kind().equals("rule")) {
                if(!rules.contains(row.recordId())) throw new IllegalArgumentException("INVALID_BACKUP");
                TaskDetails d=extra.read(row.payload(),TaskDetails.class); validDetails(d);
                if(d.deletedAt()!=null || d.deadlineDate()!=null || d.subtasks().stream().anyMatch(Subtask::done)) throw new IllegalArgumentException("INVALID_BACKUP");
            } else if(row.kind().equals("tombstone")) {
                Occurrence o=extra.read(row.payload(),Occurrence.class);
                if(o.day()==null || !rules.contains(o.ruleId()) || !row.recordId().equals(occurrenceKey(o.ruleId(),o.day()))) throw new IllegalArgumentException("INVALID_BACKUP");
            } else if(row.kind().equals("focus")) {
                FocusRecord f=extra.read(row.payload(),FocusRecord.class);
                if(!row.recordId().equals(f.id) || f.taskId==null || f.title==null || f.title.length()>100 || !Set.of("running","paused","interrupted","rest","finished","cancelled").contains(f.status) || f.startedAt==null || f.lastTick==null || f.phaseStart==null || f.spans==null || f.focusMinutes<1 || f.focusMinutes>180 || f.restMinutes<1 || f.restMinutes>60) throw new IllegalArgumentException("INVALID_BACKUP");
                LocalDateTime end=f.startedAt;
                for(var span:f.spans) { if(span.start()==null || span.end()==null || span.start().isBefore(end) || span.end().isBefore(span.start()) || span.end().isAfter(f.lastTick)) throw new IllegalArgumentException("INVALID_BACKUP"); end=span.end(); }
                if(f.outcome!=null && !Set.of("complete","interrupted","cancelled").contains(f.outcome)) throw new IllegalArgumentException("INVALID_BACKUP");
                uniqueIds(List.of(f.taskId));
                if(f.seconds()>f.focusMinutes*60L) throw new IllegalArgumentException("INVALID_BACKUP");
            } else if(row.kind().equals("focusSettings")) {
                int[] values=extra.read(row.payload(),int[].class);
                if(!row.recordId().equals("settings") || values.length!=2 || values[0]<1 || values[0]>180 || values[1]<1 || values[1]>60) throw new IllegalArgumentException("INVALID_BACKUP");
            } else if(row.kind().equals("week")) {
                Reflection r=extra.read(row.payload(),Reflection.class);valid(new ReflectionInput(r.content()));
                if(r.day()==null || r.content()==null || r.day().getDayOfWeek()!=DayOfWeek.MONDAY || !row.recordId().equals(r.day().toString())) throw new IllegalArgumentException("INVALID_BACKUP");
            } else if(row.kind().equals("problem")) {
                if(!problems.contains(row.recordId())) throw new IllegalArgumentException("INVALID_BACKUP");valid(extra.read(row.payload(),ProblemDetails.class));
            } else if(row.kind().equals("category")) {
                // Already validated before checking references.
            } else if(row.kind().equals("template")) {
                TemplateInput template=extra.read(row.payload(),TemplateInput.class);valid(template);
                for(TemplateItem item:template.items()) { validDetails(new TaskDetails(null,null,item.subtasks(),null)); if(!categoryIds.contains(item.category()) || (nullable(item.problemId())!=null && (!problems.contains(item.problemId()) || !item.category().equals("algorithm")))) throw new IllegalArgumentException("INVALID_BACKUP"); }
            } else if(row.kind().equals("request")) {
                TemplateReceipt receipt=extra.read(row.payload(),TemplateReceipt.class);
                if(receipt.templateId()==null || receipt.day()==null || receipt.taskIds()==null || receipt.taskIds().size()>50) throw new IllegalArgumentException("INVALID_BACKUP");
            } else if(row.kind().equals("reschedule")) {
                Reschedule r=extra.read(row.payload(),Reschedule.class);
                if(r.taskId()==null || r.fromDate()==null || r.toDate()==null || r.changedAt()==null) throw new IllegalArgumentException("INVALID_BACKUP");
            } else throw new IllegalArgumentException("INVALID_BACKUP");
        }
        if((s.extras()==null?List.<Row>of():s.extras()).stream().filter(r->r.kind().equals("focus")).map(r->extra.read(r.payload(),FocusRecord.class)).filter(FocusRecord::active).count()>1) throw new IllegalArgumentException("INVALID_BACKUP");
        Set<String> keys = new HashSet<>(), urls = new HashSet<>(), occurrences = new HashSet<>(), days = new HashSet<>();
        for (Problem v : s.problems()) {
            valid(new ProblemInput(v.platform(),v.number(),v.title(),v.url(),v.difficulty(),v.tags(),v.notes()));
            String url = normalizeUrl(v.url());
            if (!Objects.equals(identity(v.platform(),v.number(),url),v.identityKey()) || (v.identityKey()!=null && !keys.add(v.identityKey())) || (!url.isEmpty() && !urls.add(url))) throw new IllegalArgumentException("INVALID_BACKUP");
        }
        for (Rule v : s.rules()) {
            valid(new RuleInput(v.title(),v.category(),v.priority(),v.notes(),v.taskTime(),v.reminderTime(),v.startDate(),v.endDate(),v.frequency(),v.weekdays(),v.problemId(),v.active()));
            if ((v.endDate()!=null && v.endDate().isBefore(v.startDate())) || (v.frequency().equals("weekly") && v.weekdays().isBlank())) throw new IllegalArgumentException("INVALID_BACKUP");
            if (v.problemId()!=null && (!problems.contains(v.problemId()) || !v.category().equals("algorithm"))) throw new IllegalArgumentException("INVALID_BACKUP");
        }
        Set<String> activePlans=new HashSet<>();
        for (Task v : s.tasks()) {
            TaskDetails detail=(s.extras()==null?List.<Row>of():s.extras()).stream().filter(r->r.kind().equals("task") && r.recordId().equals(v.id())).map(r->extra.read(r.payload(),TaskDetails.class)).findFirst().orElse(TaskDetails.empty());
            if(v.problemId()!=null && detail.deletedAt()==null && !activePlans.add(v.problemId()+":"+v.planDate())) throw new IllegalArgumentException("INVALID_BACKUP");
            valid(new TaskInput(v.title(),v.category(),v.planDate(),v.taskTime(),v.priority(),v.notes(),v.status(),v.problemId(),v.reminderTime()));
            if ((v.problemId()!=null && (!problems.contains(v.problemId()) || !v.category().equals("algorithm")))
                || (v.ruleId()!=null && (!rules.contains(v.ruleId()) || v.occurrenceDate()==null || !occurrences.add(v.ruleId()+v.occurrenceDate())))
                || (v.status().equals("done") != (v.completedAt()!=null))) throw new IllegalArgumentException("INVALID_BACKUP");
        }
        for (Attempt v : s.attempts()) {
            valid(new AttemptInput(v.problemId(),v.taskId(),v.attemptedAt(),v.result(),v.minutes(),v.notes()));
            if (!problems.contains(v.problemId()) || (v.taskId()!=null && (!tasks.contains(v.taskId()) || s.tasks().stream().noneMatch(t -> t.id().equals(v.taskId()) && v.problemId().equals(t.problemId()))))) throw new IllegalArgumentException("INVALID_BACKUP");
        }
        for (Reflection v : s.reflections()) {
            valid(new ReflectionInput(v.content())); if (v.day()==null || v.content()==null || !days.add(v.day().toString())) throw new IllegalArgumentException("INVALID_BACKUP");
        }
    }
    private Set<String> uniqueIds(List<String> ids) {
        Set<String> unique = new HashSet<>();
        for (String value : ids) { if (value==null || !UUID.fromString(value).toString().equals(value) || !unique.add(value)) throw new IllegalArgumentException("INVALID_BACKUP"); }
        return unique;
    }
    public synchronized void replaceSnapshot(Snapshot s) {
        validateSnapshot(s);
        write(() -> {
            Settings old = db.settings();
            extra.resetEpoch();
            extra.replace(s.extras()==null?List.of():s.extras());
            for(FocusRecord f:focusRecords()) if(f.active()) { f.status="interrupted"; f.boot=bootId; f.notifyPending=false; extra.put("focus",f.id,f); }
            db.clearAttempts(); db.clearTasks(); db.clearRules(); db.clearProblems(); db.clearReflections();
            s.problems().forEach(db::insertProblem); s.rules().forEach(db::insertRule); s.tasks().forEach(db::insertTask);
            s.attempts().forEach(db::insertAttempt); s.reflections().forEach(db::insertReflection);
            Preferences p=s.preferences();
            db.updateSettings(new Settings(1,p.language(),p.theme(),p.color(),p.repeatEnabled(),p.remindersEnabled(),p.autoBackup(),old.backupDirectory(),old.lastAutoBackup()));
            return null;
        });
    }
}
