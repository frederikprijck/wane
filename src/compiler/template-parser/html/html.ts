import * as himalaya from 'himalaya'
import {
  AttributeBinding,
  ComponentInputBinding,
  ComponentOutputBinding,
  ConditionalViewBinding,
  HtmlElementEventBinding,
  HtmlElementPropBinding,
  InterpolationBinding,
  RepeatingViewBinding, TextBinding,
} from '../../template-nodes/view-bindings'
import {
  ViewBoundConstant,
  ViewBoundMethodCall,
  ViewBoundPlaceholder,
  ViewBoundPropertyAccess,
} from '../../template-nodes/view-bound-value'
import { TemplateNodeHtmlValue, TemplateNodeInterpolationValue } from '../../template-nodes'
import { TemplateNodeConditionalViewValue } from '../../template-nodes/nodes/conditional-view-node'
import { TemplateNodeRepeatingViewValue } from '../../template-nodes/nodes/repeating-view-node'
import { TemplateNodeValue } from '../../template-nodes/nodes/template-node-value-base'
import { TemplateNodeComponentValue } from '../../template-nodes/nodes/component-node'
import { Forest, TreeNode } from '../../utils/tree'
import { TemplateNodeTextValue } from "../../template-nodes/nodes/text-node";

function assert (test: boolean, ...message: any[]): void {
  if (!test) {
    throw new Error(message.join(' '))
  }
}

export class ParseError extends Error {

  constructor (public position: himalaya.Position,
               message: string) {
    super(message)
  }

  public toString (): string {
    const { start: { line, column } } = this.position
    return `Parse Error (${line}:${column}): ${this.message}`
  }

}

function escape (str: string): string {
  return str
    .replace(/\n/g, '\\n')
    .replace(/'/g, '\\\'')
    .replace(/"/g, '\\"')
    .replace(/`/g, '\\`')
}


const INTERPOLATION_DELIMS = ['{{', '}}'] as [string, string]
const PROP_BINDING_DELIMS = ['[', ']'] as [string, string]
const EXPLICIT_ATTR_DELIMS = ['[attr.', ']'] as [string, string]
const METHOD_BINDING_DELIMS = ['(', ')'] as [string, string]

const HANDLEBARS_REGEX = new RegExp(`${INTERPOLATION_DELIMS[0]}\\s*([^{}]+?)\\s*${INTERPOLATION_DELIMS[1]}`, 'g')
const FUNCTION_CALL_REGEX = /\(\s*([^()]*?)\s*\)/g

export function isJustPropertyAccess (string: string, disallowNegation: boolean = false): boolean {
  return disallowNegation
    ? /^[a-zA-Z.]*$/g.test(string)
    : /^!?[a-zA-Z.]*$/g.test(string)
}

export function handleText (htmlNode: himalaya.Text): TemplateNodeValue[] {
  const { content } = htmlNode
  const array = content.split(HANDLEBARS_REGEX)
  const nodes: TemplateNodeValue[] = []
  array.forEach((chunk, index) => {
    // The regex will turn "{{ foo }}" into ['', 'foo', ''].
    // We must keep them in order to maintain the indexes, so we skip them as special cases.
    if ((index == 0 || index == array.length - 1) && chunk == '') {
      return
    }

    const isText = index % 2 == 0
    let templateNode: TemplateNodeValue
    if (isText) {
      const viewBoundValue = new ViewBoundConstant(`'${escape(chunk)}'`)
      const viewBinding = new TextBinding(viewBoundValue)
      templateNode = new TemplateNodeTextValue(viewBinding, htmlNode)
    } else {
      const viewBoundValue = resolveBinding(chunk)
      const viewBinding = new InterpolationBinding(viewBoundValue)
      templateNode = new TemplateNodeInterpolationValue(viewBinding, htmlNode)
    }
    nodes.push(templateNode)
  })
  return nodes
}

function getPropName (name: string): string {
  switch (name) {
    case `class`:
      return `className`
    default:
      return name
  }
}

export function isWrappedIn (delims: [string, string]) {
  return function (string: string): boolean {
    return string.startsWith(delims[0]) && string.endsWith(delims[1])
  }
}

export const isWrappedInPropBindingDelims = isWrappedIn(PROP_BINDING_DELIMS)
export const isWrappedInExplicitAttrDelims = isWrappedIn(EXPLICIT_ATTR_DELIMS)
export const isWrappedInMethodBindingDelims = isWrappedIn(METHOD_BINDING_DELIMS)

export function stripWrapper (delims: [string, string]) {
  return function (string: string): string {
    return string.slice(delims[0].length, -delims[1].length)
  }
}

export const stripPropBindingDelims = stripWrapper(PROP_BINDING_DELIMS)
export const stripExplicitAttrDelims = stripWrapper(EXPLICIT_ATTR_DELIMS)
export const stripMethodBindingDelims = stripWrapper(METHOD_BINDING_DELIMS)

export function isPropertyOrInputBinding (attribute: himalaya.Attribute): boolean {
  const { key } = attribute
  const isNotWrapped = !isWrappedInPropBindingDelims(key) && !isWrappedInMethodBindingDelims(key)
  const hasDash = key.includes(`-`)
  return !hasDash && (isNotWrapped || (isWrappedInPropBindingDelims(key) && !isWrappedInExplicitAttrDelims(key)))
}

export function getInputName (attribute: himalaya.Attribute): string {
  assert(isPropertyOrInputBinding(attribute), `Expected`, attribute, `to be an input.`)
  return isWrappedInPropBindingDelims(attribute.key) ? stripPropBindingDelims(attribute.key) : attribute.key
}

export function isEventOrOutputBinding ({ key }: himalaya.Attribute): boolean {
  return isWrappedInMethodBindingDelims(key)
}

export function getOutputName (attribute: himalaya.Attribute): string {
  assert(isEventOrOutputBinding(attribute), `Expected`, attribute, `to be an output.`)
  return stripMethodBindingDelims(attribute.key)
}

export function isExplicitAttributeBinding ({ key }: himalaya.Attribute): boolean {
  return isWrappedInExplicitAttrDelims(key)
}

export function isImplicitAttributeBindingViaDash (attribute: himalaya.Attribute): boolean {
  if (isExplicitAttributeBinding(attribute)) return false
  return attribute.key.includes(`-`)
}

export function isAttributeBinding (htmlAttribute: himalaya.Attribute): boolean {
  return isExplicitAttributeBinding(htmlAttribute)
    || isImplicitAttributeBindingViaDash(htmlAttribute)
}

export function getAttributeName (htmlAttribute: himalaya.Attribute): string {
  assert(isAttributeBinding(htmlAttribute), `Expected`, htmlAttribute, `to be an attribute.`)
  if (isExplicitAttributeBinding(htmlAttribute)) {
    return stripExplicitAttrDelims(htmlAttribute.key)
  } else if (isImplicitAttributeBindingViaDash(htmlAttribute)) {
    return isWrappedInPropBindingDelims(htmlAttribute.key)
      ? stripPropBindingDelims(htmlAttribute.key)
      : htmlAttribute.key
  } else {
    return htmlAttribute.key
  }
}

export function isDirective (tagName: string): boolean {
  return tagName.toLowerCase().startsWith(`w:`)
}

export function isComponent (tagName: string): boolean {
  return tagName.includes('-')
}

export function handleDirectiveIf (htmlNode: himalaya.Element): TemplateNodeConditionalViewValue {
  const { attributes } = htmlNode
  if (attributes.length == 0) {
    throw new ParseError(htmlNode.position, `Must specify the condition in w:if.`)
  }

  const path = attributes.map(attr => {
    if (attr.value == null) {
      return attr.key
    } else {
      return `${attr.key} = ${attr.value}`
    }
  }).join(' ')
  if (!isJustPropertyAccess(path)) {
    throw new ParseError(htmlNode.position, `The conditional for w:if must be a property name.`)
  }

  const isNegated = path.startsWith('!')
  const valueAccessorPath = isNegated ? path.slice(1) : path

  const viewBoundValue = resolveBinding(valueAccessorPath)
  const viewBinding = new ConditionalViewBinding(viewBoundValue, isNegated)
  return new TemplateNodeConditionalViewValue(viewBinding, htmlNode)
}

export function handleDirectiveFor (htmlNode: himalaya.Element): TemplateNodeRepeatingViewValue {
  const { attributes } = htmlNode
  const definition = attributes.map(attr => attr.key.trim()).join(' ').trim()

  let boundValueAccessorPath: string
  let iterativeConstantName: string
  let indexConstantName: string | undefined
  let keyAccessorPath: string | undefined

  const [
    iterationDefinition,
    keyDefinition,
  ] = definition.split(';').map(s => s.trim())

  // Iteration definition

  const [
    iterationDefinitionLeft,
    iterationDefinitionRight,
  ] = iterationDefinition.split('of').map(s => s.trim())

  if (iterationDefinitionLeft.startsWith('(') && iterationDefinitionLeft.endsWith(')')) {
    [iterativeConstantName, indexConstantName] = iterationDefinitionLeft.slice(1, -1).split(',').map(s => s.trim())
  } else {
    iterativeConstantName = iterationDefinitionLeft
  }

  boundValueAccessorPath = iterationDefinitionRight

  // Key definition

  if (keyDefinition != null) {
    const [left, right] = keyDefinition.split(':').map(s => s.trim())
    if (right == null) {
      throw new ParseError(htmlNode.position, `Bad format after ";" in w:for.`)
    }
    if (left != 'key') {
      throw new ParseError(htmlNode.position, `Key "${left}" not supported in w:for.`)
    }
    if (!isJustPropertyAccess(right, true)) {
      throw new ParseError(htmlNode.position, `The key must be simple property access.`)
    }
    keyAccessorPath = right
  }

  const boundValue = resolveBinding(boundValueAccessorPath)
  const viewBinding = new RepeatingViewBinding(
    boundValue,
    iterativeConstantName,
    indexConstantName,
    keyAccessorPath,
  )

  return new TemplateNodeRepeatingViewValue(viewBinding, htmlNode)
}

export function handleDirective (htmlNode: himalaya.Element): TemplateNodeValue {
  const directiveName = htmlNode.tagName.slice(2).toLowerCase()
  switch (directiveName) {
    case 'if':
      return handleDirectiveIf(htmlNode)
    case 'for':
      return handleDirectiveFor(htmlNode)
    default:
      throw new Error(`Unsupported directive <w:${directiveName}>.`)
  }
}

export function isLiteral (str: string): boolean {
  // Special values
  if (str == 'null' || str == 'undefined' || str == 'true' || str == 'false') {
    return true
  }
  // String literal
  if (str.startsWith(`'`) || str.startsWith(`"`)) {
    return true
  }
  // Numbers
  if (str.match(/^\d/g) || str.startsWith('.')) {
    return true
  }
  // Otherwise, it's not a literal but a reference to something from the class.
  return false
}

function resolveBinding (str: string): ViewBoundPropertyAccess | ViewBoundConstant {
  return isLiteral(str) ? new ViewBoundConstant(str) : new ViewBoundPropertyAccess(str)
}

export function getElementOrComponentAttributes (htmlNode: himalaya.Element): Set<AttributeBinding> {
  const result = new Set<AttributeBinding>()
  for (const htmlAttribute of htmlNode.attributes) {
    if (!isAttributeBinding(htmlAttribute)) {
      continue
    }
    const viewBoundValue = htmlAttribute.value == null
      ? new ViewBoundConstant(`''`)
      : isWrappedInPropBindingDelims(htmlAttribute.key)
        ? new ViewBoundConstant(htmlAttribute.value)
        : new ViewBoundConstant(`'${htmlAttribute.value}'`)
    const attributeName = getAttributeName(htmlAttribute)
    result.add(new AttributeBinding(attributeName, viewBoundValue))
  }
  return result
}

export function getElementProps (htmlNode: himalaya.Element): Set<HtmlElementPropBinding> {
  const result = new Set<HtmlElementPropBinding>()
  for (const htmlAttribute of htmlNode.attributes) {
    if (!isPropertyOrInputBinding(htmlAttribute)) {
      continue
    }
    if (htmlAttribute.value == null) {
      throw new ParseError(htmlNode.position, `A prop bound to an HTML element must have a value.`)
    }
    const propName = getInputName(htmlAttribute)
    const viewBoundValue = isWrappedInPropBindingDelims(htmlAttribute.key)
      ? resolveBinding(htmlAttribute.value)
      : new ViewBoundConstant(`'${htmlAttribute.value}'`)
    result.add(new HtmlElementPropBinding(propName, viewBoundValue))
  }
  return result
}

function getElementEvents (htmlNode: himalaya.Element): Set<HtmlElementEventBinding> {
  const result = new Set<HtmlElementEventBinding>()
  for (const htmlAttribute of htmlNode.attributes) {
    if (!isEventOrOutputBinding(htmlAttribute)) {
      continue
    }
    if (htmlAttribute.value == null) {
      throw new ParseError(htmlNode.position, `An event bound to an HTML element must have a value.`)
    }
    const eventName = getOutputName(htmlAttribute)
    const viewBoundValue = parseMethodCall(htmlAttribute.value, htmlNode.position)
    result.add(new HtmlElementEventBinding(eventName, viewBoundValue))
  }
  return result
}

function getComponentInputs (htmlNode: himalaya.Element): Set<ComponentInputBinding> {
  const result = new Set<ComponentInputBinding>()
  for (const htmlAttribute of htmlNode.attributes) {
    if (!isPropertyOrInputBinding(htmlAttribute)) continue
    if (htmlAttribute.value == null) {
      throw new ParseError(htmlNode.position, `An input bound to a Wane component must have a value.`)
    }
    const inputName = getInputName(htmlAttribute)
    const viewBoundValue = resolveBinding(htmlAttribute.value)
    result.add(new ComponentInputBinding(inputName, viewBoundValue))
  }
  return result
}

function getComponentOutputs (htmlNode: himalaya.Element): Set<ComponentOutputBinding> {
  const result = new Set<ComponentOutputBinding>()
  for (const htmlAttribute of htmlNode.attributes) {
    if (!isEventOrOutputBinding(htmlAttribute)) continue
    if (htmlAttribute.value == null) {
      throw new ParseError(htmlNode.position, `An output bound to a Wane component must have a value.`)
    }
    const outputName = getOutputName(htmlAttribute)
    const viewBoundValue = parseMethodCall(htmlAttribute.value, htmlNode.position)
    result.add(new ComponentOutputBinding(outputName, viewBoundValue))
  }
  return result
}

export function parseMethodCall (str: string, position: himalaya.Position): ViewBoundMethodCall {
  const chunks = str.trim().split(FUNCTION_CALL_REGEX).slice(0, -1)

  if (chunks.length == 0) {
    throw new ParseError(position, `Invalid method invocation.`)
  }

  const name = chunks[0]

  if (chunks[1].trim() == '') {
    return new ViewBoundMethodCall(name, [])
  }

  const args: string[] = []

  for (const arg of chunks[1].split(',').map(a => a.trim())) {
    if (arg == '') {
      throw new ParseError(position, `Invalid method invocation.`)
    }
    args.push(arg)
  }

  return new ViewBoundMethodCall(name, args.map(arg => {
    if (arg == '#') return new ViewBoundPlaceholder()
    else return resolveBinding(arg)
  }))
}

export function handleComponent (htmlNode: himalaya.Element): TemplateNodeComponentValue {
  const tagName = htmlNode.tagName
  const attributes = getElementOrComponentAttributes(htmlNode)
  const inputs = getComponentInputs(htmlNode)
  const outputs = getComponentOutputs(htmlNode)
  return new TemplateNodeComponentValue(tagName, attributes, inputs, outputs, htmlNode)
}

export function handleElement (htmlNode: himalaya.Element): TemplateNodeHtmlValue {
  const tagName = htmlNode.tagName
  const attributes = getElementOrComponentAttributes(htmlNode)
  const props = getElementProps(htmlNode)
  const events = getElementEvents(htmlNode)
  return new TemplateNodeHtmlValue(tagName, attributes, props, events, htmlNode)
}

function handleHtmlElementNode (htmlNode: himalaya.Element): TemplateNodeValue {
  const { tagName } = htmlNode
  switch (true) {
    case isDirective(tagName):
      return handleDirective(htmlNode)
    case isComponent(tagName):
      return handleComponent(htmlNode)
    default:
      return handleElement(htmlNode)
  }
}

export function handleNodeRecursively (htmlNode: himalaya.Node): TreeNode<TemplateNodeValue>[] {
  if (htmlNode.type == 'text') {
    return handleText(htmlNode).map(v => new TreeNode(v))
  } else if (htmlNode.type == 'element') {
    const children = htmlNode.children
      .map(handleNodeRecursively)
      .reduce((acc, curr) => [...acc, ...curr], [])
    return [new TreeNode(handleHtmlElementNode(htmlNode), children)]
  } else if (htmlNode.type == 'comment') {
    return []
  } else {
    throw new Error(`Unknown HTML node type.`)
  }
}

export function parseTemplate (html: string): Forest<TemplateNodeValue> {
  try {
    const roots = himalaya.parse(html, { ...himalaya.parseDefaults, includePositions: true })
      .map(handleNodeRecursively)
      .reduce((acc, curr) => [...acc, ...curr], [])
    return new Forest(roots)
  } catch (e) {
    if (e instanceof ParseError) {
      console.error(e.toString())
    }
    throw e
  }
}
