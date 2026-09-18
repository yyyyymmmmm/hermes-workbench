package site.hermes.workbench
import org.junit.Test
import org.junit.Assert.*
class SleepIntervalsTest {
 @Test fun clipsAndMerges(){assertEquals(3.0,sleepMinutes(listOf(-60000L to 120000L,60000L to 180000L,180000L to 300000L),0,180000)!!,0.001)}
 @Test fun preservesGaps(){assertEquals(2.0,sleepMinutes(listOf(0L to 60000L,120000L to 180000L),0,240000)!!,0.001)}
 @Test fun missingIsNotZero(){assertNull(sleepMinutes(emptyList(),0,240000));assertNull(sleepMinutes(listOf(-100L to -1L),0,240000))}
}
