// Global overlay. pdoom-video's HUD (crop marks, P(doom) readout, plate captions) was song-specific;
// the post chain still composites one overlay texture, so this keeps an always-empty layer.
// ponytail: no HUD content yet; add drawing here when a song-independent overlay is needed.
import { Layer2D } from './gl';

export class Hud {
  private layer = new Layer2D();
  private tex: ReturnType<Layer2D['upload']> | null = null;

  draw() {
    if (!this.tex) { this.layer.clear(); this.tex = this.layer.upload(); }
    return this.tex;
  }
}
