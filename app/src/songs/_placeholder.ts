// Draft slate for a plate whose module is not written yet: plate id, idiom and the plate's lines with plain
// word timing, so a full draft can be timed and reviewed. plan_gate refuses a "final" song that still uses it.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, clearRT } from '../engine/gl';
import { Lyrics } from '../engine/lyrics';
import { F, font } from '../engine/type';

export default class Placeholder extends Scene {
  private layer = new Layer2D();

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { lyrics, renderer, params, id } = this.ctx;
    const c = this.layer.ctx;
    this.layer.clear('#16181B');
    c.fillStyle = '#5B6066';
    c.font = font(F.roadMono(400), 28);
    c.fillText(`PLACEHOLDER · ${id} · ${params.idiom ?? ''}`, 96, 120);
    c.fillText(`${f.t.toFixed(2)} s · bar ${f.bar.toFixed(2)}`, 96, 160);
    const line = lyrics.linesIn(f.start, f.end).find((l) => f.t >= l.start - 0.4 && f.t < l.end + 0.3);
    if (line) {
      c.font = font(F.road(700), 72);
      let x = 96;
      for (const w of line.words) {
        const p = Lyrics.wordProgress(w, f.t);
        c.fillStyle = p > 0 ? '#FFB000' : 'rgba(236,235,230,0.3)';
        c.fillText(w.w, x, 560);
        x += c.measureText(w.w + ' ').width;
      }
    }
    clearRT(renderer, out);
    this.ctx.comp.draw(renderer, this.layer.upload(), out);
  }
}
