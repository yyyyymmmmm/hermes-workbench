package site.hermes.workbench;
import android.app.Activity;
import android.os.Bundle;
import android.widget.TextView;
public class HealthPermissionsActivity extends Activity {
 @Override public void onCreate(Bundle state){super.onCreate(state);TextView view=new TextView(this);view.setPadding(32,64,32,32);view.setTextSize(17);
  boolean zh=java.util.Locale.getDefault().getLanguage().equals("zh");
  view.setText(zh?"健康数据使用\n\n仅在你主动选择指标并确认后读取。读取前会显示接收数据的网站。工作台不自动发送给 Hermes；发送健康摘要需要另外确认。\n\n可在 Health Connect 中撤销读取权限，也可在工作台清除当前读取结果。已经发送的数据不会因此从远端自动删除。":"Health data use\n\nReads only the metrics you select and confirm. Each read identifies the receiving website. The workbench does not automatically send data to Hermes; sharing a summary requires separate confirmation.\n\nRevoke access in Health Connect and clear current results in the workbench. Previously sent remote copies are not automatically deleted.");setContentView(view); }
}
