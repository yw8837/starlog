package kr.yeolmaeapps.starlog

/**
 * Opens once: the UMP consent-information update of this launch has finished (successfully or not). A caller that asks
 * before that is answered `true` when it opens, or `false` when its own deadline passes first; every caller is answered
 * exactly once. Pure (the scheduler is injected: a main-thread Handler in the app, a fake in tests); main thread only.
 */
class ConsentGate(private val schedule: (delayMs: Long, action: () -> Unit) -> Unit) {

    var isOpen = false
        private set

    private val waiting = mutableListOf<(Boolean) -> Unit>()

    fun open() {
        if (isOpen) return
        isOpen = true
        val callers = waiting.toList()
        waiting.clear()
        callers.forEach { it(true) }
    }

    /** [then] gets true once open, or false if [timeoutMs] passes first (null: no deadline). */
    fun await(timeoutMs: Long?, then: (opened: Boolean) -> Unit) {
        if (isOpen) return then(true)
        val entry: (Boolean) -> Unit = { then(it) }
        waiting += entry
        if (timeoutMs != null) schedule(timeoutMs) { if (waiting.remove(entry)) entry(false) }
    }
}
