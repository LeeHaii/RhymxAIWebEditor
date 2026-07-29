import { Composition } from 'remotion'
import { MainComposition } from './Composition'

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="MainComposition"
        component={MainComposition}
        durationInFrames={300} // This is overridden dynamically by the player
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          scenes: [],
          audioPath: '',
          audioClips: [],
          subtitleSettings: {
            enabled: true,
            fontSize: 48,
            textColor: '#ffffff',
            backgroundColor: '#000000',
            position: 'bottom' as const,
          },
        }}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.max(
            1,
            Math.ceil(
              Math.max(
                10,
                ...props.scenes.map((scene) => scene.endTimeSec),
                ...(props.audioClips || []).map(
                  (clip) => clip.startTimeSec + clip.durationSec
                )
              ) * 30
            )
          ),
        })}
      />
    </>
  )
}
