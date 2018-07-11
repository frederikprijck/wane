// @ts-ignore
import { Template, Entry } from 'wane'
import { getAnswer } from './mock-api'

@Entry()
@Template(`
  <form (submit)="onSubmit(#)">
    <label>
      <span>Question{{' '}}</span>
      <input type="text" name="question">
    </label>
  </form>
  
  <w:if isAnswerVisible>
    <output>{{ answer }}</output>  
  </w:if>
`)
export class App {

  private answer: string | undefined

  private get isAnswerVisible () {
    return this.answer != null
  }

  private onSubmit (event: Event): void {
    event.preventDefault()
    const formEl = event.target as HTMLFormElement
    const questionEl = formEl.elements.namedItem('question') as HTMLInputElement
    getAnswer(questionEl.value).then(answer => {
      this.answer = answer
      questionEl.value = ''
    })
  }

}
