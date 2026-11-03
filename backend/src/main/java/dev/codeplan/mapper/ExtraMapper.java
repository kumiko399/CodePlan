package dev.codeplan.mapper;

import java.util.List;
import org.apache.ibatis.annotations.*;

@Mapper
public interface ExtraMapper {
    record Row(String kind,String recordId,String payload) {}
    @Select("SELECT kind,record_id,payload FROM planner_extra ORDER BY kind,record_id") List<Row> all();
    @Select("SELECT payload FROM planner_extra WHERE kind=#{kind} AND record_id=#{id}") String get(@Param("kind") String kind,@Param("id") String id);
    @Delete("DELETE FROM planner_extra WHERE kind=#{kind} AND record_id=#{id}") void delete(@Param("kind") String kind,@Param("id") String id);
    @Insert("INSERT INTO planner_extra(kind,record_id,payload) VALUES(#{kind},#{recordId},#{payload})") void insert(Row row);
    @Delete("DELETE FROM planner_extra") void clear();
    @Select("SELECT meta_value FROM planner_meta WHERE meta_key=#{key}") String meta(String key);
    @Delete("DELETE FROM planner_meta WHERE meta_key=#{key}") void deleteMeta(String key);
    @Insert("INSERT INTO planner_meta(meta_key,meta_value) VALUES(#{key},#{value})") void insertMeta(@Param("key") String key,@Param("value") String value);
}
