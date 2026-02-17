package com.holoscript.intellij.parser

import com.holoscript.intellij.HoloScriptLanguage
import com.intellij.extapi.psi.PsiFileBase
import com.intellij.psi.FileViewProvider

/**
 * PSI file type for HoloScript.
 */
class HoloScriptFile(viewProvider: FileViewProvider) :
    PsiFileBase(viewProvider, HoloScriptLanguage) {

    override fun getFileType() =
        com.holoscript.intellij.HoloScriptFileType.INSTANCE

    override fun toString(): String = "HoloScript File"
}
