import * as React from 'react'

export const ZeddSvgIcon = ({
  res,
  progress,
  stopped,
  background,
  stroke = 'currentColor',
}: {
  res: number
  progress: number
  stopped: boolean
  background?: string
  stroke: string
}) => {
  const TAU = 2 * Math.PI
  const strokeWidth = res === 24 ? 2 : res === 16 ? 1.2 : Math.round(res * 0.1)
  const resHalf = res / 2
  const strokeProps: React.SVGAttributes<{}> = {
    strokeWidth,
    strokeLinejoin: 'round',
    strokeLinecap: 'round',
    stroke,
  }
  const octRadius = (resHalf - strokeWidth / 2) / Math.cos(TAU / 8 / 2)
  const longHandLength = resHalf - strokeWidth
  const shortHandLength = resHalf / 2

  return (
    <svg
      version='1.1'
      xmlns='http://www.w3.org/2000/svg'
      height={res}
      width={res}
      viewBox={[-resHalf, -resHalf, res, res].join()}
      // transform='scale(0.125)'
    >
      {background && <circle r='300' fill={background} />}
      {stopped ? (
        <g>
          <polygon
            points={[0, 1, 2, 3, 4, 5, 6, 7]
              .map((_, i) => {
                const rad = (TAU * (i + 0.5)) / 8
                return Math.cos(rad) * octRadius + ' ' + Math.sin(rad) * octRadius
              })
              .join(' ')}
            {...strokeProps}
            fill='none'
          />
          <line
            y2={-shortHandLength}
            transform={`rotate(45) translate(0, ${shortHandLength / 2})`}
            {...strokeProps}
          />
          <line
            y2={-longHandLength}
            transform={`rotate(-45) translate(0, ${longHandLength / 2})`}
            {...strokeProps}
          />
        </g>
      ) : (
        <g>
          <circle r={resHalf - strokeWidth / 2} {...strokeProps} fill='none' />
          <line y2={-shortHandLength} {...strokeProps} />
          <line y2={-longHandLength} transform={`rotate(${progress * 360})`} {...strokeProps} />
        </g>
      )}
    </svg>
  )
}
