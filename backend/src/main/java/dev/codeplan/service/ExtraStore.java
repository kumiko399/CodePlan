package dev.codeplan.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.codeplan.mapper.ExtraMapper;
import java.util.*;
import org.springframework.stereotype.Component;

/** Small typed extension documents; writes participate in PlannerService's lock and transaction. */
@Component
public class ExtraStore {
    private final ExtraMapper db;
    private final ObjectMapper json;
    public ExtraStore(ExtraMapper db,ObjectMapper json,DatabaseMigration migration) { this.db=db;this.json=json; }
    public <T> T get(String kind,String id,Class<T> type,T fallback) {
        String payload=db.get(kind,id); return payload==null?fallback:read(payload,type);
    }
    public <T> T read(String payload,Class<T> type) {
        try { return json.readValue(payload,type); } catch(Exception e) { throw new IllegalArgumentException("INVALID_EXTRA_DATA",e); }
    }
    public void put(String kind,String id,Object value) {
        try { String payload=json.writeValueAsString(value); db.delete(kind,id); db.insert(new ExtraMapper.Row(kind,id,payload)); }
        catch(com.fasterxml.jackson.core.JsonProcessingException e) { throw new IllegalArgumentException("INVALID_EXTRA_DATA",e); }
    }
    public void delete(String kind,String id) { db.delete(kind,id); }
    public List<ExtraMapper.Row> all() { return db.all(); }
    public void replace(List<ExtraMapper.Row> rows) { db.clear(); rows.forEach(db::insert); }
    public String meta(String key) {
        String value=db.meta(key); if(value==null) {value=UUID.randomUUID().toString();db.insertMeta(key,value);} return value;
    }
    public void resetEpoch() {db.deleteMeta("epoch");db.insertMeta("epoch",UUID.randomUUID().toString());}
}
