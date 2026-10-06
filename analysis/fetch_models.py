"""Download every model weight the analysis needs into analysis/.cache/ (one-time, ~4 GB).

Run:  uv run python fetch_models.py
"""
import common  # noqa: F401  (sets cache dirs before any model import)

KARAOKE_MODEL = "mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt"
WHISPER_REPO = "mlx-community/whisper-large-v3-turbo"


def main():
    from demucs.pretrained import get_model
    get_model("htdemucs_ft")
    print("ok htdemucs_ft", flush=True)

    import torchaudio
    torchaudio.pipelines.MMS_FA.get_model()
    torchaudio.pipelines.WAV2VEC2_ASR_LARGE_LV60K_960H.get_model()
    print("ok MMS_FA + wav2vec2 LV60K", flush=True)

    from huggingface_hub import snapshot_download
    snapshot_download(WHISPER_REPO)
    print("ok", WHISPER_REPO, flush=True)

    from audio_separator.separator import Separator
    sep = Separator(model_file_dir=str(common.CACHE / "separator"), output_dir=str(common.WORK))
    sep.load_model(KARAOKE_MODEL)
    print("ok", KARAOKE_MODEL, flush=True)


if __name__ == "__main__":
    main()
