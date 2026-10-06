[English](README.md) | [한국어](README.ko.md)

# Audio to Film

음악 분석, 시간에 따른 WebGL 렌더링, 에이전트 기반 연출을 연결한 실험용 영상 제작 엔진입니다.

![프로젝트 소개 도해](assets/hero.png)

## 주요 기능

- 음악을 악기별로 분리하고 박자·구간·목소리 특징·가사 시간을 분석합니다.
- three.js와 화면 없는 Chrome에서 곡의 시간에 맞춰 프레임을 그립니다.
- 중단된 렌더링을 완료된 조각부터 이어서 진행합니다.
- 고정된 장면만 반복하는 대신 곡별 연출안과 장면 코드를 작성할 수 있습니다.
- 움직임, 가사 배치, 장면 계획, 독립 비평 기록을 검사합니다.

기존 오픈소스 렌더링·분석 코드를 활용했고, 제작 단계의 연결과 수치 기반 검사 기능을 더했습니다.

## 시작하기

Bun, Python 3.12 또는 3.13, uv, FFmpeg/ffprobe, Chrome이 필요합니다. 현재 GPU 렌더링은 macOS Metal 환경을 전제로 합니다. 제작과 QA를 실행하는 Python에는 NumPy, SciPy, OpenCV가 필요합니다.

저장소를 복제하고 `cd audio-to-film`으로 이동한 다음 아래 환경을 준비해 주세요.

```bash
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python numpy scipy opencv-python
source .venv/bin/activate
```

`analysis/`는 별도 uv 환경을 사용합니다. 분석 환경 설치만으로 루트 QA 의존성이 설치되지는 않습니다.

```bash
git clone https://github.com/VoidLight00/audio-to-film.git
cd audio-to-film
cd app && bun install && cd ..
cd analysis && uv sync && uv run python fetch_models.py && cd ..
bun run create-film -- /path/to/your-song.mp3 --draft
bash gates/verify_audio_to_film.sh .
```

모델 다운로드에는 네트워크와 저장 공간이 필요합니다. 처리 권한이 있는 음원과 가사만 사용해 주세요.

```bash
bun run create-film -- /path/to/your-song.mp3 --lyrics lyrics.txt
bun run create-film -- /path/to/your-song.mp3 --scale 2
bun run create-film -- --resume outputs/<run>
```

곡별 연출에는 연출안, 타임라인, 장면 코드, 독립 검수가 필요합니다. `.claude/skills/audio-to-film/SKILL.md`와 `playbooks/`를 참고해 주세요.

일반 v2 렌더러는 비공개 기준 이미지 없이 실행할 수 있습니다. 곡별 비평 도구는 개발 당시 기준 자료 경로를 사용하므로, 실행 전에 사용 권한이 있는 기준 이미지 세 장을 직접 준비해야 합니다. 경로는 `docs/research/frames/ref_cuts.png`, `docs/research/frames/ref_lyric_midpoints.png`, `docs/research/frames/detail_crops_100pct.png`입니다. `src/engineer_brief.py`가 요구하는 외부 코드 예시도 별도로 준비해야 하며, 공개 사본에는 포함되지 않습니다. 실제 기준 자료로 검수하기 전에는 곡을 최종 승인 상태로 표시하지 마세요.

## 구조

음원 디코딩 → 악기 분리 → 음악 분석 → 가사 시간 정렬 → 연출 → 조각별 렌더링 → 결과 검사 순서로 진행합니다.

![구조 소개 도해](assets/architecture.png)

- `analysis/`: 음악 분석 모델과 시간 정렬 도구입니다.
- `app/src/engine/`: 그래픽, 글자, 후처리를 담당합니다.
- `app/src/archetypes/`: 재사용 가능한 장면입니다.
- `app/src/songs/edit.ts`: 시간과 가사 기준점 도구입니다.
- `src/`: 제작 명령과 프레임·계획·비평 검사입니다.
- `gates/`: 실행 가능한 검사 스크립트입니다.

## 소개 이미지

아래 이미지는 프로젝트를 설명하기 위해 생성한 도해입니다. 엔진이 만든 실제 영상 프레임은 아닙니다.

![소리 분석 소개 도해](assets/gallery-1.png)
![장면 구성 소개 도해](assets/gallery-2.png)
![검수 소개 도해](assets/gallery-3.png)

## 기반 도구와 참고 아이디어

Demucs, audio-separator, Whisper, torchaudio, librosa, three.js, Vite, opentype.js, Playwright, OpenCV, FFmpeg를 활용합니다.

별도로 살펴본 프로젝트는 [phase-viz](https://github.com/7g3n/phase-viz), [particula](https://github.com/Humprt/particula), [under-neon-lights](https://github.com/within-unlimited/under-neon-lights)입니다. 반영 범위는 일부 시각 효과와 소리 조회 아이디어에 한정됩니다.

## 현재 한계

자동으로 영화 수준의 품질을 보장하는 도구는 아닙니다. 곡별 장면 작성에는 여전히 상당한 작업이 필요하며, 자동 검사는 실제 영상 검토를 대신하지 못합니다.

공개 사본에서는 개발에 사용한 곡, 가사, 완성 영상, 내부 연구 자료와 세션 기록을 제외했습니다. 이 저장소에는 최종 승인을 받은 곡별 영상이 포함되지 않습니다. 소개 이미지는 설명용 도해입니다.

`frame_metrics.py --calibrate`는 공개하지 않은 개발용 자료가 있어야 실행됩니다. 일반 측정에는 직접 준비한 영상과 실행 폴더를 전달할 수 있습니다. 기존 합격선은 특정 기준 영상에서 정한 값이므로 모든 영상의 품질을 보장하지 않습니다.

## 라이선스

프로젝트에서 추가한 코드는 MIT 라이선스입니다. 기존 외부 코드의 고지는 `app/LICENSE.pdoom-video`에, 글꼴의 고지는 동봉된 글꼴 라이선스 파일에 보존했습니다. FFmpeg의 조건은 설치한 빌드에 따라 달라집니다. 음원·가사·모델 가중치의 이용 조건은 코드와 별개입니다.
