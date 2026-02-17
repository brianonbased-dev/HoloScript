package com.holoscript.intellij.structure

import com.holoscript.intellij.HoloScriptIcons
import com.holoscript.intellij.parser.HoloScriptElementTypes
import com.holoscript.intellij.parser.HoloScriptFile
import com.intellij.ide.structureView.*
import com.intellij.ide.util.treeView.smartTree.TreeElement
import com.intellij.lang.PsiStructureViewFactory
import com.intellij.navigation.ItemPresentation
import com.intellij.openapi.editor.Editor
import com.intellij.psi.NavigatablePsiElement
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import javax.swing.Icon

/**
 * Structure view factory for HoloScript.
 *
 * Populates the Structure tool window with compositions, orbs, templates,
 * and their properties so developers can navigate large files quickly.
 */
class HoloScriptStructureViewFactory : PsiStructureViewFactory {

    override fun getStructureViewBuilder(psiFile: PsiFile): StructureViewBuilder =
        object : TreeBasedStructureViewBuilder() {
            override fun createStructureViewModel(editor: Editor?): StructureViewModel =
                HoloScriptStructureViewModel(psiFile)
        }
}

// ---------------------------------------------------------------------------

private class HoloScriptStructureViewModel(psiFile: PsiFile) :
    StructureViewModelBase(psiFile, HoloScriptFileStructureElement(psiFile)),
    StructureViewModel.ElementInfoProvider {

    override fun isAlwaysShowsPlus(element: StructureViewTreeElement?) = false
    override fun isAlwaysLeaf(element: StructureViewTreeElement?) = false
}

// ---------------------------------------------------------------------------

private class HoloScriptFileStructureElement(private val file: PsiFile) :
    StructureViewTreeElement {

    override fun getValue(): Any = file

    override fun navigate(requestFocus: Boolean) {
        if (file is NavigatablePsiElement) file.navigate(requestFocus)
    }

    override fun canNavigate(): Boolean = file is NavigatablePsiElement

    override fun canNavigateToSource(): Boolean = canNavigate()

    override fun getPresentation(): ItemPresentation =
        object : ItemPresentation {
            override fun getPresentableText(): String = file.name
            override fun getIcon(unused: Boolean): Icon = HoloScriptIcons.FILE
        }

    override fun getChildren(): Array<TreeElement> {
        val result = mutableListOf<TreeElement>()
        var child = file.node.firstChildNode
        while (child != null) {
            if (child.elementType == HoloScriptElementTypes.DECLARATION) {
                result.add(HoloScriptDeclarationElement(child.psi))
            }
            child = child.treeNext
        }
        return result.toTypedArray()
    }
}

// ---------------------------------------------------------------------------

private class HoloScriptDeclarationElement(private val element: PsiElement) :
    StructureViewTreeElement {

    override fun getValue(): Any = element

    override fun navigate(requestFocus: Boolean) {
        if (element is NavigatablePsiElement) element.navigate(requestFocus)
    }

    override fun canNavigate(): Boolean = element is NavigatablePsiElement
    override fun canNavigateToSource(): Boolean = canNavigate()

    override fun getPresentation(): ItemPresentation =
        object : ItemPresentation {
            override fun getPresentableText(): String {
                val text = element.text
                val firstLine = text.lines().firstOrNull() ?: "declaration"
                return firstLine.trim().take(60)
            }
            override fun getIcon(unused: Boolean): Icon = HoloScriptIcons.OBJECT
        }

    override fun getChildren(): Array<TreeElement> = emptyArray()
}
