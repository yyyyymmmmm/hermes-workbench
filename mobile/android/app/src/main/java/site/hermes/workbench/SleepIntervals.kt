package site.hermes.workbench

internal fun sleepMinutes(intervals:List<Pair<Long,Long>>,start:Long,end:Long):Double? {
 val clipped=intervals.map{maxOf(it.first,start) to minOf(it.second,end)}.filter{it.second>it.first}.sortedBy{it.first}
 if(clipped.isEmpty())return null
 var left=clipped[0].first;var right=clipped[0].second;var total=0L
 for((a,b) in clipped.drop(1)){if(a<=right)right=maxOf(right,b) else{total+=right-left;left=a;right=b}}
 return (total+right-left)/60000.0
}
