import Project, { IndentationText, SourceFile, SyntaxKind } from "ts-simple-ast";
import { stripIndent } from "common-tags";
import { expandArrowFunction, expandCallback, injectCodeInExpandedFunction } from "./wrap-async-code";

export function createProjectFromString (fileContent: string): {
  project: Project,
  sourceFile: SourceFile,
} {
  const project = new Project({
    useVirtualFileSystem: true,
    manipulationSettings: { indentationText: IndentationText.TwoSpaces },
  })
  const sourceFile = project.createSourceFile('__temp__.ts', fileContent)
  return { project, sourceFile }
}

fdescribe(`wrap-async-code`, () => {

  describe(`expandArrowFunction`, () => {

    it(`ignores arrow function if it already has body`, () => {
      const code = `const arrowFn = () => { return 42 }`
      const { sourceFile } = createProjectFromString(code)
      const arrowFunction = sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction)
      expandArrowFunction(arrowFunction)
      expect(sourceFile.getFullText()).toBe(code)
    })

    it(`expands arrow function without body`, () => {
      const code = `const arrowFn = () => 42`
      const { sourceFile } = createProjectFromString(code)
      const arrowFunction = sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction)
      expandArrowFunction(arrowFunction)
      const expected = stripIndent`
        const arrowFn = () => {
          return 42
        }
      `
      expect(sourceFile.getFullText()).toBe(expected)
    })

    it(`does not get tricked by returning an object literal`, () => {
      const code = `const arrowFn = () => ({ life: 42 })`
      const { sourceFile } = createProjectFromString(code)
      const arrowFunction = sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.ArrowFunction)
      expandArrowFunction(arrowFunction)
      const expected = stripIndent`
        const arrowFn = () => {
          return { life: 42 }
        }
      `
      expect(sourceFile.getFullText()).toBe(expected)
    })

  })


  describe(`expandCallback`, () => {

    it(`does nothing when it's already expanded as arrow function`, () => {
      const code = `callback(() => { return 42 })`
      const { sourceFile } = createProjectFromString(code)
      const callExpression = sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression)
      const syntaxList = callExpression.getFirstDescendantByKindOrThrow(SyntaxKind.SyntaxList)
      expandCallback(syntaxList)
      expect(sourceFile.getFullText()).toBe(code)
    })

    it(`does nothing when it's already expanded as a function`, () => {
      const code = `callback(function () { return 42 })`
      const { sourceFile } = createProjectFromString(code)
      const callExpression = sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression)
      const syntaxList = callExpression.getFirstDescendantByKindOrThrow(SyntaxKind.SyntaxList)
      expandCallback(syntaxList)
      expect(sourceFile.getFullText()).toBe(code)
    })

    it(`expands a function reference`, () => {
      const code = `callback(handler)`
      const { sourceFile } = createProjectFromString(code)
      const callExpression = sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression)
      const syntaxList = callExpression.getFirstDescendantByKindOrThrow(SyntaxKind.SyntaxList)
      expandCallback(syntaxList)
      const expected = stripIndent`
        callback((...args: any[]) => {
          return handler(...args)
        })
      `
      expect(sourceFile.getFullText()).toBe(expected)
    })

    it(`expands a rebound function reference`, () => {
      const code = `callback(this.handler.bind(this))`
      const { sourceFile } = createProjectFromString(code)
      const callExpression = sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression)
      const syntaxList = callExpression.getFirstDescendantByKindOrThrow(SyntaxKind.SyntaxList)
      expandCallback(syntaxList)
      const expected = stripIndent`
        callback((...args: any[]) => {
          return this.handler.bind(this)(...args)
        })
      `
      expect(sourceFile.getFullText()).toBe(expected)
    })

    it(`expands a shorthand for arrow function`, () => {
      const code = `callback(() => 42)`
      const { sourceFile } = createProjectFromString(code)
      const callExpression = sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression)
      const syntaxList = callExpression.getFirstDescendantByKindOrThrow(SyntaxKind.SyntaxList)
      expandCallback(syntaxList)
      const expected = stripIndent`
        callback(() => {
          return 42
        })
      `
      expect(sourceFile.getFullText()).toBe(expected)
    })

  })


  describe(`injectCodeInExpandedFunction`, () => {

    it(`injects code in arrow function`, () => {
      const code = stripIndent`
        callback(() => {
          return 42
        })
      `
      const { sourceFile } = createProjectFromString(code)
      const callExpression = sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression)
      const syntaxList = callExpression.getFirstDescendantByKindOrThrow(SyntaxKind.SyntaxList)
      injectCodeInExpandedFunction(syntaxList, w => w.writeLine(`// injected`))
      const expected = stripIndent`
        callback((...args: any[]) => {
          const __wane__result = (() => {
            return 42
          })(...args)
          // injected
          return __wane__result
        })
      `
      expect(sourceFile.getFullText()).toBe(expected)
    })

    it(`injects code in a function`, () => {
      const code = stripIndent`
        callback(function named () {
          return 42
        })
      `
      const { sourceFile } = createProjectFromString(code)
      const callExpression = sourceFile.getFirstDescendantByKindOrThrow(SyntaxKind.CallExpression)
      const syntaxList = callExpression.getFirstDescendantByKindOrThrow(SyntaxKind.SyntaxList)
      injectCodeInExpandedFunction(syntaxList, w => w.writeLine(`// injected`))
      const expected = stripIndent`
        callback((...args: any[]) => {
          const __wane__result = (function named () {
            return 42
          })(...args)
          // injected
          return __wane__result
        })
      `
      expect(sourceFile.getFullText()).toBe(expected)
    })

  })

  const source = stripIndent`
  export class Foo {
    
    p1
    p2
    p3
    p4
  
    m1 () {
      this.p1 = 1
      fetch()
      .then(r => {
        console.log(r)
        return r
      })
      .then(r => r.toString())
      .then(this.setP1.bind(this))
      .then(r => this.p2 = r)
      .then(r => {
        this.p3 = r
        return 2
      })
      .catch(err => {
        this.p4 = 1
      })
    }
  
    setP1 (newP1) {
      return this.p1 = newP1
    }
  
  }
`

})
