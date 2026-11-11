package kr.yeolmaeapps.starlog

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ConsentGateTest {
    /** A fake main-thread scheduler: actions run only when the test fires them. */
    private val scheduled = mutableListOf<Pair<Long, () -> Unit>>()
    private val gate = ConsentGate { delayMs, action -> scheduled += delayMs to action }

    private fun fireTimers() = scheduled.toList().also { scheduled.clear() }.forEach { it.second() }

    @Test fun answersAtOnceWhenAlreadyOpen() {
        gate.open()
        val answers = mutableListOf<Boolean>()
        gate.await(2_500) { answers += it }
        assertEquals(listOf(true), answers)
        assertTrue(scheduled.isEmpty())
    }

    @Test fun waitsForTheUpdateThenAnswersOnce() {
        val answers = mutableListOf<Boolean>()
        gate.await(2_500) { answers += it }
        assertEquals(emptyList<Boolean>(), answers)
        assertEquals(2_500L, scheduled.single().first)

        gate.open()
        fireTimers()
        assertEquals(listOf(true), answers)
    }

    @Test fun deadlineFirstAnswersFalseOnce() {
        val answers = mutableListOf<Boolean>()
        gate.await(2_500) { answers += it }
        fireTimers()
        gate.open()
        assertEquals(listOf(false), answers)
        assertTrue(gate.isOpen)
    }

    @Test fun noDeadlineWaitsAsLongAsItTakes() {
        val answers = mutableListOf<Boolean>()
        gate.await(null) { answers += it }
        assertTrue(scheduled.isEmpty())
        gate.open()
        assertEquals(listOf(true), answers)
    }

    @Test fun eachWaiterIsAnsweredIndependently() {
        val first = mutableListOf<Boolean>()
        val second = mutableListOf<Boolean>()
        val third = mutableListOf<Boolean>()
        gate.await(2_500) { first += it }
        gate.await(null) { second += it }
        fireTimers()
        gate.await(2_500) { third += it }
        gate.open()
        gate.open()
        fireTimers()
        assertEquals(listOf(false), first)
        assertEquals(listOf(true), second)
        assertEquals(listOf(true), third)
    }
}
