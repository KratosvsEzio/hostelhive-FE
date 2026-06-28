import { Directive } from '@angular/core';

@Directive({
  selector: '[hhLink]',
  host: { class: 'underline decoration-dotted underline-offset-4 decoration-1 hover:decoration-solid' },
})
export class HhLink {}
