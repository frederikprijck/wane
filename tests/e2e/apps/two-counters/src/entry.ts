import { Entry, Register, Template } from 'wane'

@Template(`
  <button (click)="dec()">
    Decrement
  </button>
  
  <span>{{ value }}</span>
  
  <button (click)="inc()">
    Increment
  </button>
`)
export class CounterCmp {
  public value!: number

  public valueChange (value: number): void {
  }

  private inc () {
    this.valueChange(this.value + 1)
  }

  private dec () {
    this.valueChange(this.value - 1)
  }
}

@Entry()
@Register(CounterCmp)
@Template(`
  <p>Left is {{ left }}, right is {{ right }}.</p>

  <counter-cmp
    [value]="left"
    (valueChange)="onLeftChange(#)"
  />
  
  <counter-cmp
    [value]="right"
    (valueChange)="onRightChange(#)"
  />
`)
export class AppCmp {
  private left = 42
  private right = 21

  private onLeftChange (val: number): void {
    this.left = val
  }

  private onRightChange (val: number): void {
    this.right = val
  }
}
