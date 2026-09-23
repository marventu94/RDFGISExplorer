import {
  Component,
  AfterViewInit,
  OnChanges,
  OnDestroy,
  Input,
  ViewChild,
  ElementRef,
  SimpleChanges,
} from '@angular/core';
import { EditorView, lineNumbers } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { sparql } from 'codemirror-lang-sparql';

@Component({
  selector: 'sparql-viewer',
  standalone: true,
  template: `<div #container class="cm-host"></div>`,
  styles: [`
    :host { display: block; overflow: hidden; }
    .cm-host { font-size: 0.8rem; }
    :host-context(html[data-theme='dark']) ::ng-deep .cm-gutters {
      background: #302e2b;
      color: #948b83;
      border-right-color: #48433e;
    }
    :host-context(html[data-theme='dark']) ::ng-deep .cm-activeLineGutter {
      background: #35322e;
      color: #c1b8b0;
    }
  `],
})
export class SparqlViewerComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) content!: string;
  @ViewChild('container', { static: true }) host!: ElementRef<HTMLElement>;
  private view?: EditorView;

  ngAfterViewInit(): void {
    this.view = new EditorView({
      doc: this.content,
      extensions: [
        lineNumbers(),
        EditorState.readOnly.of(true),
        sparql(),
      ],
      parent: this.host.nativeElement,
    });
  }

  ngOnChanges(c: SimpleChanges): void {
    if (c['content'] && this.view) {
      this.view.dispatch({
        changes: {
          from: 0,
          to: this.view.state.doc.length,
          insert: this.content,
        },
      });
    }
  }

  ngOnDestroy(): void {
    this.view?.destroy();
  }
}
