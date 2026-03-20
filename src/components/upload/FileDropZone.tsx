import { useState, useRef, useCallback, type ReactNode } from 'react'

interface Props {
  onFiles: (files: File[]) => void
  accept?: string
  multiple?: boolean
  children?: ReactNode
}

export function FileDropZone({ onFiles, accept = '.xlsx,.xls,.csv', multiple = false, children }: Props) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const counter = useRef(0)

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    counter.current++
    setDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    counter.current--
    if (counter.current === 0) setDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    counter.current = 0
    setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length) onFiles(multiple ? files : [files[0]])
  }, [onFiles, multiple])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length) onFiles(files)
    e.target.value = ''
  }, [onFiles])

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragEnter={handleDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative cursor-pointer rounded-xl border-2 border-dashed p-6
        transition-all duration-200 text-center
        ${dragging
          ? 'border-brand-400 bg-brand-50/50 scale-[1.01]'
          : 'border-slate-300 hover:border-brand-300 hover:bg-slate-50/50'
        }
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        className="hidden"
      />
      {children || (
        <div className="text-sm text-slate-500">
          클릭하거나 파일을 드래그하세요
        </div>
      )}
    </div>
  )
}
