package dev.codeplan.service;

import dev.codeplan.model.FocusRecord;
import dev.codeplan.model.FocusRecord.Span;
import java.time.*;
import java.util.*;

/** Pure clock transitions, including sleep/crash gaps. */
public final class FocusClock {
    private FocusClock() {}
    public static void tick(FocusRecord f, LocalDateTime now, String boot) {
        if(!f.active()) return;
        long gap=Duration.between(f.lastTick,now).getSeconds();
        if(!Objects.equals(f.boot,boot) || gap<0 || gap>15) {
            f.status="interrupted"; f.boot=boot; f.lastTick=now; return;
        }
        if(f.status.equals("running")) {
            long remaining=f.focusMinutes*60L-f.seconds();
            LocalDateTime limit=f.lastTick.plusSeconds(remaining);
            LocalDateTime end=now.isBefore(limit)?now:limit;
            if(end.isAfter(f.lastTick)) {
                if(!f.spans.isEmpty() && f.spans.getLast().end().equals(f.lastTick)) {
                    Span previous=f.spans.removeLast(); f.spans.add(new Span(previous.start(),end));
                } else f.spans.add(new Span(f.lastTick,end));
            }
            if(f.seconds()>=f.focusMinutes*60L) {
                f.status="rest"; f.outcome="complete"; f.phaseStart=now; f.endedAt=end; f.notifyPending=true;
            }
        } else if(f.status.equals("rest") && !now.isBefore(f.phaseStart.plusMinutes(f.restMinutes))) {
            f.status="finished"; f.notifyPending=true;
        }
        f.lastTick=now;
    }
    public static long secondsOn(FocusRecord f, LocalDate day) {
        if(f.status.equals("cancelled")) return 0;
        long seconds=0;
        for(Span span:f.spans) {
            LocalDateTime start=span.start().isAfter(day.atStartOfDay())?span.start():day.atStartOfDay();
            LocalDateTime end=span.end().isBefore(day.plusDays(1).atStartOfDay())?span.end():day.plusDays(1).atStartOfDay();
            if(end.isAfter(start)) seconds+=Duration.between(start,end).getSeconds();
        }
        return seconds;
    }
}
