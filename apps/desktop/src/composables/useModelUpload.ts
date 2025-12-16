import { ref } from 'vue'
import { open } from '@tauri-apps/api/dialog'
import {
  createDir,
  readDir,
  readBinaryFile,
  writeBinaryFile,
  writeTextFile,
  removeDir,
} from '@tauri-apps/api/fs'
import { appDataDir, join } from '@tauri-apps/api/path'
import JSZip from 'jszip'

export interface UploadProgress {
  stage: 'reading' | 'extracting' | 'saving' | 'done' | 'error'
  progress: number // 0-100
  message: string
}

export function useModelUpload() {
  const isUploading = ref(false)
  const uploadProgress = ref<UploadProgress>({
    stage: 'reading',
    progress: 0,
    message: '',
  })
  const error = ref<string | null>(null)

  const updateProgress = (stage: UploadProgress['stage'], progress: number, message: string) => {
    uploadProgress.value = { stage, progress, message }
  }

  /**
   * 打开文件选择对话框
   */
  const selectModelFile = async (): Promise<string | null> => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: 'Live2D Model',
            extensions: ['zip'],
          },
        ],
      })

      if (typeof selected === 'string') {
        return selected
      }
      return null
    } catch (e) {
      console.error('File selection error:', e)
      return null
    }
  }

  /**
   * 上传并解压 Live2D 模型 zip 文件
   * @param filePath 用户选择的 zip 文件路径
   * @param modelName 模型名称（用作文件夹名）
   * @returns 模型 JSON 文件的路径，失败返回 null
   */
  const uploadModel = async (filePath: string, modelName: string): Promise<string | null> => {
    if (!filePath.endsWith('.zip')) {
      error.value = '请选择 zip 格式的模型文件'
      return null
    }

    isUploading.value = true
    error.value = null

    try {
      // 阶段1: 读取 zip 文件
      updateProgress('reading', 10, '正在读取文件...')
      const fileData = await readBinaryFile(filePath)
      const arrayBuffer = fileData.buffer

      // 阶段2: 解压 zip
      updateProgress('extracting', 30, '正在解压模型...')
      const zip = await JSZip.loadAsync(arrayBuffer)

      // 查找模型文件 (model.json 或 model3.json)
      let foundModelPath: string | null = null

      zip.forEach((relativePath, _zipEntry) => {
        const fileName = relativePath.toLowerCase()
        if (fileName.endsWith('.model3.json') || fileName.endsWith('.model.json')) {
          if (!foundModelPath || relativePath.length < foundModelPath.length) {
            // 优先选择路径最短的（最顶层的）
            foundModelPath = relativePath
          }
        }
      })

      if (!foundModelPath) {
        throw new Error('未找到模型文件 (model.json 或 model3.json)')
      }

      const modelJsonPath: string = foundModelPath

      // 获取模型所在的目录
      const modelDir = modelJsonPath.includes('/')
        ? modelJsonPath.substring(0, modelJsonPath.lastIndexOf('/'))
        : ''

      // 清理模型名称，移除非法字符
      const safeModelName = modelName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_')

      // 获取应用数据目录
      const appData = await appDataDir()
      const targetDir = await join(appData, 'models', safeModelName)

      // 阶段3: 保存文件
      updateProgress('saving', 50, '正在保存模型文件...')

      // 确保目标目录存在
      try {
        await createDir(await join(appData, 'models'), { recursive: true })
      } catch {
        // 目录可能已存在
      }

      try {
        await createDir(targetDir, { recursive: true })
      } catch {
        // 目录可能已存在
      }

      // 解压并保存所有文件
      const files = Object.keys(zip.files)
      let savedCount = 0

      for (const filePath of files) {
        const zipEntry = zip.files[filePath]
        if (zipEntry.dir) continue // 跳过目录

        // 计算相对路径（相对于模型目录）
        let relativePath = filePath
        if (modelDir && filePath.startsWith(modelDir + '/')) {
          relativePath = filePath.substring(modelDir.length + 1)
        } else if (modelDir && filePath.startsWith(modelDir)) {
          relativePath = filePath.substring(modelDir.length)
        }

        const targetPath = await join(targetDir, relativePath)

        // 确保父目录存在
        const lastSlashIndex = relativePath.lastIndexOf('/')
        if (lastSlashIndex > 0) {
          const parentDir = relativePath.substring(0, lastSlashIndex)
          const parentPath = await join(targetDir, parentDir)
          try {
            await createDir(parentPath, { recursive: true })
          } catch {
            // 目录可能已存在
          }
        }

        // 判断是否是文本文件
        const isTextFile = /\.(json|txt|html|css|js|xml)$/i.test(filePath)

        if (isTextFile) {
          // 文本文件
          const textContent = await zipEntry.async('string')
          await writeTextFile(targetPath, textContent)
        } else {
          // 二进制文件
          const binaryContent = await zipEntry.async('uint8array')
          await writeBinaryFile(targetPath, binaryContent)
        }

        savedCount++
        const progress = 50 + Math.floor((savedCount / files.length) * 40)
        updateProgress('saving', progress, `正在保存文件 (${savedCount}/${files.length})...`)
      }

      // 获取模型 JSON 的完整路径
      const modelFileName = modelJsonPath.includes('/')
        ? modelJsonPath.substring(modelJsonPath.lastIndexOf('/') + 1)
        : modelJsonPath

      const resultPath = await join(targetDir, modelFileName)

      updateProgress('done', 100, '模型上传成功！')
      return resultPath
    } catch (e) {
      console.error('Model upload error:', e)
      error.value = e instanceof Error ? e.message : '上传失败'
      updateProgress('error', 0, error.value)
      return null
    } finally {
      isUploading.value = false
    }
  }

  /**
   * 获取已上传的模型列表
   */
  const getUploadedModels = async (): Promise<string[]> => {
    try {
      const appData = await appDataDir()
      const modelsDir = await join(appData, 'models')

      const result = await readDir(modelsDir)
      return result.filter((f) => f.children !== undefined).map((f) => f.name || '')
    } catch {
      return []
    }
  }

  /**
   * 获取已上传模型的路径
   */
  const getModelPath = async (modelName: string): Promise<string | null> => {
    try {
      const appData = await appDataDir()
      const modelDir = await join(appData, 'models', modelName)
      const files = await readDir(modelDir)

      // 查找模型 JSON 文件
      for (const file of files) {
        const fileName = file.name?.toLowerCase() || ''
        if (fileName.endsWith('.model3.json') || fileName.endsWith('.model.json')) {
          return await join(modelDir, file.name || '')
        }
      }

      return null
    } catch {
      return null
    }
  }

  /**
   * 删除已上传的模型
   */
  const deleteModel = async (modelName: string): Promise<boolean> => {
    try {
      const appData = await appDataDir()
      const modelDir = await join(appData, 'models', modelName)

      await removeDir(modelDir, { recursive: true })
      return true
    } catch (e) {
      console.error('Delete model error:', e)
      return false
    }
  }

  return {
    isUploading,
    uploadProgress,
    error,
    selectModelFile,
    uploadModel,
    getUploadedModels,
    getModelPath,
    deleteModel,
  }
}
