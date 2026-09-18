package site.hermes.workbench;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.net.Uri;
import android.content.Intent;
import android.webkit.*;
import android.widget.*;
import java.net.URI;
import androidx.activity.ComponentActivity;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;
import org.json.JSONArray;
import android.provider.CalendarContract;
import java.util.function.Consumer;

public class MainActivity extends ComponentActivity {
    private WebView web;
    private String origin = "";
    private boolean english;
    private HealthReader health;
    private Consumer<JSONObject> calendarReply;
    private boolean nativeBusy;
    private int documentGeneration;
    private String label(String en, String zh) { return english ? en : zh; }

    @Override public void onCreate(Bundle saved) {
        setTheme(R.style.AppTheme_NoActionBar);
        super.onCreate(saved);
        health = new HealthReader(this);
        english = !java.util.Locale.getDefault().getLanguage().equals("zh");
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setOnApplyWindowInsetsListener((v, insets) -> {
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(android.view.WindowInsets.Type.systemBars());
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else { v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom()); }
            return insets;
        });
        Button settings = new Button(this);
        settings.setText(label("Workspace server", "工作台服务器"));
        settings.setOnClickListener(v -> chooseServer());
        layout.addView(settings);
        web = new WebView(this);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) { documentGeneration++; }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                String url = request.getUrl().toString();
                if (sameOrigin(url)) return false;
                if ("https".equals(request.getUrl().getScheme())) {
                    new AlertDialog.Builder(MainActivity.this).setMessage(label("Open external link?", "打开外部链接？"))
                        .setNegativeButton(android.R.string.cancel, null)
                        .setPositiveButton(android.R.string.ok, (d,w) -> {
                            try { startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl())); } catch (Exception ignored) {}
                        }).show();
                }
                return true;
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError error) {
                if(req.isForMainFrame()) Toast.makeText(MainActivity.this, label("Connection failed. Check your server address.", "连接失败，请检查服务器地址。"), Toast.LENGTH_LONG).show();
            }
        });
        layout.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(layout);
        origin = getPreferences(MODE_PRIVATE).getString("origin", "");
        if (origin.isEmpty()) chooseServer(); else { installBridge(); web.loadUrl(origin); }
    }
    private boolean sameOrigin(String value) {
        try { return normalized(value, false).equals(origin); } catch(Exception e) { return false; }
    }
    private String normalized(String value, boolean rootOnly) throws Exception {
        URI url = new URI(value.trim());
        if (!"https".equalsIgnoreCase(url.getScheme()) || url.getHost()==null || url.getUserInfo()!=null ||
            rootOnly && (url.getQuery()!=null || url.getFragment()!=null || !(url.getPath().isEmpty() || url.getPath().equals("/")))) throw new Exception();
        return new URI("https", null, url.getHost().toLowerCase(java.util.Locale.ROOT), url.getPort()==443?-1:url.getPort(), null, null, null).toString();
    }
    private void chooseServer() {
        EditText field = new EditText(this); field.setSingleLine(true); field.setHint("https://"); field.setText(origin);
        field.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        new AlertDialog.Builder(this).setTitle(label("Workspace server", "工作台服务器"))
            .setView(field).setNegativeButton(android.R.string.cancel,null)
            .setPositiveButton(label("Connect", "连接"),(dialog,which)->{
                try {
                    String next=normalized(field.getText().toString(),true);
                    new AlertDialog.Builder(this).setMessage(label("Connect to ", "连接到 ")+next+label("? Unsent content will be lost.", "？未发送内容将丢失。"))
                        .setNegativeButton(android.R.string.cancel,null).setPositiveButton(android.R.string.ok,(d,w)->{
                            web.stopLoading(); documentGeneration++;origin=next;getPreferences(MODE_PRIVATE).edit().putString("origin",origin).apply();installBridge();web.loadUrl(origin);web.clearHistory();
                        }).show();
                } catch(Exception e) { Toast.makeText(this,label("Enter an HTTPS server origin.", "请输入 HTTPS 服务器根地址。"),Toast.LENGTH_LONG).show(); }
            }).show();
    }
    private JSONObject error(String code) { JSONObject result=new JSONObject();try {result.put("error",code);}catch(Exception ignored){}return result; }
    private void installBridge() {
        if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))return;
        WebViewCompat.removeWebMessageListener(web,"HermesNative");
        WebViewCompat.addWebMessageListener(web,"HermesNative",java.util.Collections.singleton(origin),(view,message,source,isMain,proxy)->{
            if(!isMain||!sameOrigin(source.toString())||nativeBusy)return;
            try {
                JSONObject request=new JSONObject(message.getData());
                String id=request.getString("id"),method=request.getString("method");
                if(!id.matches("[a-zA-Z0-9-]{1,64}")||!java.util.Arrays.asList("health.read","calendar.read").contains(method))return;
                java.util.ArrayList<String> keys=new java.util.ArrayList<>();
                JSONArray selected=request.optJSONArray("metrics");
                if(selected!=null)for(int n=0;n<Math.min(selected.length(),6);n++){String key=selected.optString(n);if(java.util.Arrays.asList("steps","weight","restingHeartRate","bodyFat","oxygen","bloodGlucose").contains(key)&&!keys.contains(key))keys.add(key);}
                if(method.equals("health.read")&&keys.isEmpty())return;
                int generation=documentGeneration;String requestedOrigin=origin;nativeBusy=true;
                Consumer<JSONObject> reply=result->{
                    nativeBusy=false;
                    if(generation!=documentGeneration||!origin.equals(requestedOrigin)||!sameOrigin(web.getUrl()))return;
                    try {result.put("id",id);proxy.postMessage(result.toString());}catch(Exception ignored){}
                };
                new AlertDialog.Builder(this).setTitle(label("Share device data?", "共享设备数据？"))
                    .setMessage(requestedOrigin+"\n"+(method.equals("health.read")?label("Today's steps / latest values in 7 days: ", "今日步数／近七天最新指标：")+android.text.TextUtils.join(", ",keys):label("Calendar titles and times for the next 7 days (up to 100)", "未来七天的日历标题和时间（最多100条）"))+"\n"+label("Data will be available to this website. Allow this read?", "数据将交给此网站。允许本次读取？"))
                    .setNegativeButton(android.R.string.cancel,(d,w)->reply.accept(error("CANCELLED")))
                    .setOnCancelListener(d->reply.accept(error("CANCELLED")))
                    .setPositiveButton(android.R.string.ok,(d,w)->{
                        if(generation!=documentGeneration){reply.accept(error("CANCELLED"));return;}
                        if(method.equals("health.read"))health.request(keys.toArray(new String[0]),reply);else {
                            if(checkSelfPermission(android.Manifest.permission.READ_CALENDAR)==android.content.pm.PackageManager.PERMISSION_GRANTED)readCalendar(reply);
                            else {calendarReply=reply;requestPermissions(new String[]{android.Manifest.permission.READ_CALENDAR},41);}
                        }
                    }).show();
            }catch(Exception ignored){}
        });
    }
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] grants){
        super.onRequestPermissionsResult(code,permissions,grants);
        if(code==41&&calendarReply!=null){Consumer<JSONObject> reply=calendarReply;calendarReply=null;if(grants.length>0&&grants[0]==android.content.pm.PackageManager.PERMISSION_GRANTED)readCalendar(reply);else reply.accept(error("PERMISSION_DENIED"));}
    }
    private void readCalendar(Consumer<JSONObject> reply){
        new Thread(()->{
            JSONObject result;
            try {
                long start=System.currentTimeMillis(),end=start+7L*24*60*60*1000;
                Uri.Builder uri=CalendarContract.Instances.CONTENT_URI.buildUpon();android.content.ContentUris.appendId(uri,start);android.content.ContentUris.appendId(uri,end);
                JSONArray events=new JSONArray();
                try(android.database.Cursor cursor=getContentResolver().query(uri.build(),new String[]{CalendarContract.Instances.TITLE,CalendarContract.Instances.BEGIN,CalendarContract.Instances.END,CalendarContract.Instances.ALL_DAY},null,null,CalendarContract.Instances.BEGIN+" ASC")){
                    if(cursor==null)throw new Exception();
                    while(events.length()<100&&cursor.moveToNext())events.put(new JSONObject().put("title",cursor.getString(0)).put("start",cursor.getLong(1)).put("end",cursor.getLong(2)).put("allDay",cursor.getInt(3)!=0));
                }
                result=new JSONObject().put("source","Android Calendar").put("events",events).put("limit",100).put("from",start).put("to",end);
            }catch(Exception e){result=error("READ_FAILED");}
            JSONObject value=result;runOnUiThread(()->reply.accept(value));
        }).start();
    }
    @Override protected void onDestroy() { documentGeneration++;calendarReply=null;if(health!=null)health.close();if(web!=null)web.destroy();super.onDestroy(); }
}
