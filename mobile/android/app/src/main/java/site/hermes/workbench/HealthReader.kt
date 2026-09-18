package site.hermes.workbench
import androidx.activity.ComponentActivity
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import kotlinx.coroutines.*
import java.time.ZonedDateTime
import java.util.function.Consumer
import org.json.JSONObject
import org.json.JSONArray

class HealthReader(private val activity: ComponentActivity) {
 private val scope=CoroutineScope(SupervisorJob()+Dispatchers.Main)
 private val types=mapOf("steps" to StepsRecord::class,"sleep" to SleepSessionRecord::class,"weight" to WeightRecord::class,"restingHeartRate" to RestingHeartRateRecord::class,"bodyFat" to BodyFatRecord::class,"oxygen" to OxygenSaturationRecord::class,"bloodGlucose" to BloodGlucoseRecord::class)
 private var keys=listOf<String>()
 private var reply: Consumer<JSONObject>?=null
 private val launcher=activity.registerForActivityResult(PermissionController.createRequestPermissionResultContract()){read()}
 fun request(selected: Array<String>, callback: Consumer<JSONObject>) {
  if(reply!=null){callback.accept(JSONObject().put("error","BUSY"));return}
  reply=callback;keys=selected.distinct().filter{it in types}
  if(keys.isEmpty()){finish(JSONObject().put("error","INVALID_INPUT"));return}
  if(HealthConnectClient.getSdkStatus(activity)!=HealthConnectClient.SDK_AVAILABLE){finish(JSONObject().put("error","HEALTH_UNAVAILABLE"));return}
  scope.launch {try{val wanted=keys.map{HealthPermission.getReadPermission(types.getValue(it))}.toSet()
   if(HealthConnectClient.getOrCreate(activity).permissionController.getGrantedPermissions().containsAll(wanted))read() else launcher.launch(wanted)
  }catch(_:Exception){finish(JSONObject().put("error","READ_FAILED"))}}
 }
 private fun read(){scope.launch{try{
  val now=ZonedDateTime.now();val end=now.toInstant();val start=now.minusDays(7).toInstant()
  val client=HealthConnectClient.getOrCreate(activity);val grants=client.permissionController.getGrantedPermissions();val metrics=JSONArray()
  for(key in keys){val item=JSONObject().put("key",key)
   if(HealthPermission.getReadPermission(types.getValue(key)) !in grants){metrics.put(item.put("status","denied"));continue}
   try{val range=TimeRangeFilter.between(start,end);var value:Number?=null;var at:String?=null;var unit=""
    when(key){
     "sleep"->{val since=end.minusSeconds(86400);val records=client.readRecords(ReadRecordsRequest(SleepSessionRecord::class,TimeRangeFilter.between(since,end),pageSize=1000))
      if(records.pageToken!=null)throw IllegalStateException("Incomplete range")
      val intervals=records.records.flatMap{it.stages}.filter{it.stage in setOf(2,4,5,6)}.map{it.startTime.toEpochMilli() to it.endTime.toEpochMilli()}
      value=sleepMinutes(intervals,since.toEpochMilli(),end.toEpochMilli());at=end.toString();unit="min";item.put("from",since.toString()).put("aggregation","union_of_asleep_stages")}
     "steps"->{value=client.aggregate(AggregateRequest(setOf(StepsRecord.COUNT_TOTAL),TimeRangeFilter.between(now.toLocalDate().atStartOfDay(now.zone).toInstant(),end)))[StepsRecord.COUNT_TOTAL];at=end.toString();unit="count"}
     "weight"->{val r=client.readRecords(ReadRecordsRequest(WeightRecord::class,range,ascendingOrder=false,pageSize=1)).records.firstOrNull();value=r?.weight?.inKilograms;at=r?.time?.toString();unit="kg"}
     "restingHeartRate"->{val r=client.readRecords(ReadRecordsRequest(RestingHeartRateRecord::class,range,ascendingOrder=false,pageSize=1)).records.firstOrNull();value=r?.beatsPerMinute;at=r?.time?.toString();unit="bpm"}
     "bodyFat"->{val r=client.readRecords(ReadRecordsRequest(BodyFatRecord::class,range,ascendingOrder=false,pageSize=1)).records.firstOrNull();value=r?.percentage?.value;at=r?.time?.toString();unit="%"}
     "oxygen"->{val r=client.readRecords(ReadRecordsRequest(OxygenSaturationRecord::class,range,ascendingOrder=false,pageSize=1)).records.firstOrNull();value=r?.percentage?.value;at=r?.time?.toString();unit="%"}
     "bloodGlucose"->{val r=client.readRecords(ReadRecordsRequest(BloodGlucoseRecord::class,range,ascendingOrder=false,pageSize=1)).records.firstOrNull();value=r?.level?.inMillimolesPerLiter;at=r?.time?.toString();unit="mmol/L"}
    }
    item.put("value",value?:JSONObject.NULL).put("at",at?:JSONObject.NULL).put("unit",unit).put("status",if(value==null)"no_data" else "available")
   }catch(_:Exception){item.put("status","read_failed")};metrics.put(item)
  };finish(JSONObject().put("source","Health Connect").put("metrics",metrics).put("from",start.toString()).put("to",end.toString()))
 }catch(_:Exception){finish(JSONObject().put("error","READ_FAILED"))}}}
 private fun finish(value:JSONObject){val callback=reply;reply=null;callback?.accept(value)}
 fun close(){reply=null;scope.cancel()}
}
