package com.tiktaktv.tv

/** The first TV Back press minimizes live playback; Back on the mini-player closes it. */
object TvDialogBackPolicy {
    const val actionSelector =
        "[aria-label*=\"Minimize live player\"], [aria-label*=\"Close\"], .close, button[value=\"cancel\"]"
}
