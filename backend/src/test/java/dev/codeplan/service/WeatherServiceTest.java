package dev.codeplan.service;

import com.fasterxml.jackson.databind.*;
import java.net.URI;
import java.nio.file.*;
import java.time.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class WeatherServiceTest {
    @Test void displayPreferencesSurviveRestartAndRejectInvalidValues() throws Exception {
        var d=new WeatherService.Display("F","kmh",true,true);
        service.saveDisplay(d);
        assertEquals(d,new WeatherService(json,provider,dir,time).display());
        assertThrows(IllegalArgumentException.class,()->service.saveDisplay(new WeatherService.Display("K","ms",false,false)));
        assertEquals(d,service.display());
        Files.writeString(dir.resolve("weather-display.json"),"invalid");
        assertThrows(IllegalStateException.class,()->service.display());
        assertEquals("invalid",Files.readString(dir.resolve("weather-display.json")));
    }
    @TempDir Path dir;
    final ObjectMapper json = new ObjectMapper();
    static class Time extends Clock {
        Instant now=Instant.parse("2026-10-27T04:00:00Z");
        public ZoneId getZone(){return ZoneOffset.UTC;}
        public Clock withZone(ZoneId zone){return this;}
        public Instant instant(){return now;}
        void advance(long seconds){now=now.plusSeconds(seconds);}
    }
    class Provider extends WeatherHttp {
        int calls; String failure; JsonNode response; URI last;
        Provider() {super(json);}
        @Override public JsonNode get(URI uri) {calls++;last=uri;if(failure!=null)throw new IllegalStateException(failure);return response;}
    }
    Time time; Provider provider; WeatherService service;
    @BeforeEach void setup() throws Exception {
        time=new Time(); provider=new Provider(); service=new WeatherService(json,provider,dir,time);
        var fixture=json.createObjectNode();
        fixture.put("timezone","Asia/Shanghai");
        fixture.putObject("current").put("time",time.instant().getEpochSecond()).put("temperature_2m",0);
        fixture.putObject("current_units").put("temperature_2m","°C").put("wind_speed_10m","m/s");
        var hours=fixture.putObject("hourly").putArray("time");for(int i=0;i<24;i++)hours.add(time.instant().getEpochSecond()+i*3600);
        fixture.putObject("daily").putArray("time").add(time.instant().getEpochSecond());
        provider.response=fixture;
    }
    @Test void defaultDoesNotLocateAndCoordinatesAreValidated() {
        assertEquals("unset",service.preferences().mode());
        assertThrows(IllegalArgumentException.class,()->service.locate());
        assertThrows(IllegalArgumentException.class,()->service.forecast(Double.NaN,0));
        assertThrows(IllegalArgumentException.class,()->service.forecast(91,0));
        assertEquals(0,provider.calls);
    }
    @Test void preferencesSurviveRestartAndRejectBadValuesWithoutOverwrite() {
        var original=service.save(new WeatherService.Preferences("manual",new WeatherService.City(" 北京 ",39.9042,116.4074)));
        assertEquals(39.90,original.city().latitude());
        assertEquals(original,new WeatherService(json,provider,dir,time).preferences());
        assertThrows(IllegalArgumentException.class,()->service.save(new WeatherService.Preferences("manual",new WeatherService.City("",0,0))));
        assertEquals(original,service.preferences());
        assertNull(service.save(new WeatherService.Preferences("unset",original.city())).city());
    }
    @Test void corruptPreferencesArePreserved() throws Exception {
        var file=dir.resolve("weather-preferences.json");Files.writeString(file,"broken");
        assertThrows(IllegalStateException.class,()->service.preferences());
        assertEquals("broken",Files.readString(file));assertEquals(0,provider.calls);
    }
    @Test void cacheIsPerCoordinateAndExpiredFailureDoesNotPretendToBeFresh() {
        var first=service.forecast(39.904,116.404);
        assertEquals(first,service.forecast(39.90,116.40));assertEquals(1,provider.calls);
        time.advance(901);provider.failure="WEATHER_UNAVAILABLE";
        var stale=service.forecast(39.9,116.4);
        assertTrue(stale.stale());assertEquals(first.fetchedAt(),stale.fetchedAt());assertEquals(2,provider.calls);
        service.forecast(39.9,116.4);assertEquals(2,provider.calls);
        assertThrows(IllegalStateException.class,()->service.forecast(35.68,139.69));
        time.advance(21600);assertThrows(IllegalStateException.class,()->service.forecast(39.9,116.4));
    }
    @Test void invalidResponseNeverReplacesGoodCache() {
        var first=service.forecast(39.9,116.4);time.advance(901);provider.response=json.createObjectNode();
        assertEquals(first.data(),service.forecast(39.9,116.4).data());
        assertThrows(IllegalStateException.class,()->service.forecast(1,2));
    }
    @Test void rateLimitHasCooldownAndUrlUsesOnlyRequestedPublicCoordinates() {
        provider.failure="WEATHER_RATE_LIMITED";
        assertThrows(IllegalStateException.class,()->service.forecast(39.9,116.4));
        time.advance(60);assertThrows(IllegalStateException.class,()->service.forecast(39.9,116.4));assertEquals(1,provider.calls);
        time.advance(241);assertThrows(IllegalStateException.class,()->service.forecast(39.9,116.4));assertEquals(2,provider.calls);
        assertEquals("api.open-meteo.com",provider.last.getHost());assertTrue(provider.last.getQuery().contains("models=best_match"));
    }
    @Test void locationRequiresConsentCachesAndClearsOnDisable() throws Exception {
        provider.response=json.readTree("{\"success\":true,\"city\":\"Beijing\",\"country\":\"China\",\"latitude\":39.9042,\"longitude\":116.4074}");
        service.save(new WeatherService.Preferences("auto",null));
        assertEquals(39.9,service.locate().latitude());service.locate();assertEquals(1,provider.calls);
        service.save(new WeatherService.Preferences("unset",null));assertThrows(IllegalArgumentException.class,()->service.locate());assertEquals(1,provider.calls);
    }
    @Test void citySearchEncodesQueryAndIncludesRegion() throws Exception {
        provider.response=json.readTree("{\"results\":[{\"name\":\"北京\",\"admin1\":\"北京市\",\"country\":\"中国\",\"latitude\":39.9042,\"longitude\":116.4074}]}");
        assertTrue(service.cities("北京","zh").getFirst().name().contains("中国"));
        assertTrue(provider.last.toString().contains("%E5%8C%97"));service.cities("北京","zh");assertEquals(1,provider.calls);
        assertThrows(IllegalArgumentException.class,()->service.cities("a","zh"));
    }
    @Test void providerRejectsUnknownHostsBeforeNetwork() {
        assertThrows(IllegalArgumentException.class,()->new WeatherHttp(json).get(URI.create("https://example.com/")));
        assertThrows(IllegalArgumentException.class,()->new WeatherHttp(json).get(URI.create("http://api.open-meteo.com/")));
    }
    @Test void oldCityMigratesAndMultipleCitiesSurviveRestart() throws Exception {
        Files.writeString(dir.resolve("weather-preferences.json"),"{\"mode\":\"manual\",\"city\":{\"name\":\"北京\",\"latitude\":39.9,\"longitude\":116.4}}");
        var old=service.preferences();assertEquals(1,old.cities().size());
        var tokyo=new WeatherService.City("东京",35.68,139.69);
        var saved=service.save(new WeatherService.Preferences("manual",tokyo,java.util.List.of(old.city(),tokyo,tokyo)));
        assertEquals(2,saved.cities().size());assertEquals(saved,new WeatherService(json,provider,dir,time).preferences());
        var auto=service.save(new WeatherService.Preferences("auto",null,saved.cities()));assertEquals(2,auto.cities().size());
    }
}
