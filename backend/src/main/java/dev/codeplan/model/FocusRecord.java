package dev.codeplan.model;

import java.time.LocalDateTime;
import java.util.*;

/** Only verified, contiguous running intervals contribute to focus time. */
public class FocusRecord {
    public record Span(LocalDateTime start, LocalDateTime end) {}
    public String id, taskId, title, status, boot, outcome;
    public int focusMinutes, restMinutes;
    public LocalDateTime startedAt, endedAt, lastTick, phaseStart;
    public List<Span> spans = new ArrayList<>();
    public boolean notifyPending;
    public boolean active() { return Set.of("running","paused","interrupted","rest").contains(status); }
    public long seconds() { return spans.stream().mapToLong(s->java.time.Duration.between(s.start(),s.end()).getSeconds()).sum(); }
}
