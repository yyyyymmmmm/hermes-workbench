package site.hermes.workbench;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;
import org.json.JSONObject;
import android.util.Base64;
import okhttp3.*;

final class WorkspaceHttp {
 private final URI origin;
 private final CookieManager cookies=new CookieManager(null,CookiePolicy.ACCEPT_ORIGINAL_SERVER);
 private final ExecutorService executor=Executors.newFixedThreadPool(4);
 private final AtomicInteger count=new AtomicInteger();
 private final OkHttpClient client=new OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).connectTimeout(15,TimeUnit.SECONDS).readTimeout(75,TimeUnit.SECONDS).callTimeout(85,TimeUnit.SECONDS).build();
 WorkspaceHttp(String origin){this.origin=URI.create(origin);}
 void close(){client.dispatcher().cancelAll();executor.shutdownNow();cookies.getCookieStore().removeAll();}
 void request(JSONObject input,Consumer<JSONObject> reply){
  if(count.incrementAndGet()>16){count.decrementAndGet();reply.accept(error("TOO_MANY_REQUESTS"));return;}
  executor.execute(()->{try{
   String method=input.optString("method","GET").toUpperCase(Locale.ROOT);
   URI path=new URI(input.getString("path"));String body=input.optString("body","");
   if(path.isAbsolute()||path.getRawAuthority()!=null||path.getFragment()!=null||!path.getRawPath().matches("/api/[A-Za-z0-9/_-]+")||body.getBytes(StandardCharsets.UTF_8).length>524288||!Arrays.asList("GET","POST","PATCH","DELETE","PUT").contains(method))throw new Exception();
   URI target=origin.resolve(path);Request.Builder request=new Request.Builder().url(target.toString()).header("Origin",origin.toString());
   JSONObject headers=input.optJSONObject("headers");
   for(String name:Arrays.asList("content-type","x-csrf-token","x-workspace-user","idempotency-key"))if(headers!=null&&headers.has(name)){String value=headers.getString(name);if(value.length()>4096||value.contains("\r")||value.contains("\n"))throw new Exception();request.header(name,value);}
   synchronized(cookies){for(Map.Entry<String,List<String>> header:cookies.get(target,Collections.emptyMap()).entrySet())request.header(header.getKey(),String.join("; ",header.getValue()));}
   request.method(method,method.equals("GET")?null:RequestBody.create(body.getBytes(StandardCharsets.UTF_8),MediaType.parse("application/json")));
   try(Response response=client.newCall(request.build()).execute()){
   int status=response.code();if(status>=300&&status<400)throw new Exception();
   synchronized(cookies){cookies.put(target,response.headers().toMultimap());}
   InputStream stream=response.body()==null?null:response.body().byteStream();ByteArrayOutputStream buffer=new ByteArrayOutputStream();
   if(stream!=null)try(InputStream data=stream){byte[] chunk=new byte[8192];int n;while((n=data.read(chunk))!=-1){if(buffer.size()+n>8*1024*1024)throw new Exception();buffer.write(chunk,0,n);}}
   reply.accept(new JSONObject().put("status",status).put("body",Base64.encodeToString(buffer.toByteArray(),Base64.NO_WRAP)).put("contentType",response.header("Content-Type","application/json")));}
  }catch(Exception e){reply.accept(error("CONNECTION_FAILED"));}finally{count.decrementAndGet();}});
 }
 private JSONObject error(String code){JSONObject result=new JSONObject();try{result.put("error",code);}catch(Exception ignored){}return result;}
}
