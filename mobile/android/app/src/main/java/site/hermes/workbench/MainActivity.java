package site.hermes.workbench;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.net.Uri;
import android.content.Intent;
import android.webkit.*;
import android.widget.*;
import java.net.URI;

public class MainActivity extends Activity {
    private WebView web;
    private String origin = "";
    private boolean english;
    private String label(String en, String zh) { return english ? en : zh; }

    @Override public void onCreate(Bundle saved) {
        setTheme(R.style.AppTheme_NoActionBar);
        super.onCreate(saved);
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
        if (origin.isEmpty()) chooseServer(); else web.loadUrl(origin);
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
                            web.stopLoading(); origin=next;getPreferences(MODE_PRIVATE).edit().putString("origin",origin).apply();web.loadUrl(origin);web.clearHistory();
                        }).show();
                } catch(Exception e) { Toast.makeText(this,label("Enter an HTTPS server origin.", "请输入 HTTPS 服务器根地址。"),Toast.LENGTH_LONG).show(); }
            }).show();
    }
    @Override protected void onDestroy() { if(web!=null)web.destroy();super.onDestroy(); }
}
