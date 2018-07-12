import { ArrowFunction, ClassDeclaration, default as Project, SyntaxKind, SyntaxList, TypeGuards } from 'ts-simple-ast'
import { assert } from 'chai'

export function expandArrowFunction (arrowFunction: ArrowFunction): void {

  const equalsGreaterThen = arrowFunction.getEqualsGreaterThan()
  const nextNode = equalsGreaterThen.getNextSiblingOrThrow()

  // If the function already has a block (is expanded), we bail out.
  if (TypeGuards.isBlock(nextNode)) {
    return
  }

  // If the returned value is parenthesized expression, we strip away the parenthesis.
  // This is for cases like () => ({}), where we wanna just "return {}" instead of "return ({})".
  const desiredReturnValue = nextNode.getKind() == SyntaxKind.ParenthesizedExpression
    ? nextNode.getText().slice(1, -1)
    : nextNode.getText()

  nextNode.replaceWithText(writer => {
    writer
      .write(`{`)
      .newLine()
      .indentBlock(() => {
        writer
          .writeLine(`return ${desiredReturnValue}`)
      })
      .write(`}`)
  })

}

export function expandCallback (syntaxList: SyntaxList): void {

  console.assert(syntaxList.getChildCount() == 1, `Expected SyntaxList to have a single child.`)
  const node = syntaxList.getFirstChildOrThrow()

  // Things like ".then(this.handle.bind(this)" or ".then(handles)".
  if (TypeGuards.isCallExpression(node) || TypeGuards.isIdentifier(node)) {
    node.replaceWithText(writer => {
      writer
        .write(`(...args: any[]) => {`)
        .newLine()
        .indentBlock(() => {
          writer
            .writeLine(`return ${node.getText()}(...args)`)
        })
        .write(`}`)
    })
    return
  }

  // An arrow function, we delegate this.
  if (TypeGuards.isArrowFunction(node)) {
    expandArrowFunction(node)
    return
  }

}

export function getCalledMethods () {

}

function processClassDeclaration (classDeclaration: ClassDeclaration) {

  const methods = classDeclaration.getMethods()
  for (const method of methods) {

    const block = method.getFirstDescendantByKind(SyntaxKind.Block)
    if (block == null) continue

    const propAccessExpressions = method.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
    for (const propAccessExpression of propAccessExpressions) {

      const name = propAccessExpression.getName()
      if (name != 'then' && name != 'catch') {
        continue
      }

      const syntaxList = propAccessExpression.getNextSibling(node => {
        return node.getKind() == SyntaxKind.SyntaxList
      })

      console.log(syntaxList && syntaxList.getText())

    }

  }

}

export default function processProject (project: Project): void {

  const sourceFiles = project.getSourceFiles()
  for (const sourceFile of sourceFiles) {

    const classDeclarations = sourceFile.getClasses()
    for (const classDeclaration of classDeclarations) {
      processClassDeclaration(classDeclaration)
    }

  }

}
