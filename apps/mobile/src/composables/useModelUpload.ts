import { ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import JSZip from 'jszip'

export interface UploadProgress {
  stage: 'reading' | 'extracting' | 'saving' | 'done' | 'error'
  progress: number // 0-100
  message: string
}

// 动作组信息
export interface MotionGroupInfo {
  group: string
  count: number
}

// 模型上传结果信息
export interface ModelUploadInfo {
  modelName: string
  expressionCount: number
  motionGroups: MotionGroupInfo[]
  textureCount: number
  totalFiles: number
}

// 上传结果
export interface UploadResult {
  path: string
  info: ModelUploadInfo
}

export function useModelUpload() {
  const isUploading = ref(false)
  const uploadProgress = ref<UploadProgress>({
    stage: 'reading',
    progress: 0,
    message: '',
  })
  const error = ref<string | null>(null)

  /**
   * 上传并解压 Live2D 模型 zip 文件
   * @param file 用户选择的 zip 文件
   * @param modelName 模型名称（用作文件夹名）
   * @returns 上传结果（包含路径和模型信息），失败返回 null
   */
  const uploadModel = async (file: File, modelName: string): Promise<UploadResult | null> => {
    if (!file.name.endsWith('.zip')) {
      error.value = '请选择 zip 格式的模型文件'
      return null
    }

    isUploading.value = true
    error.value = null

    try {
      // 阶段1: 读取 zip 文件
      updateProgress('reading', 10, '正在读取文件...')
      const arrayBuffer = await file.arrayBuffer()

      // 阶段2: 解压 zip
      updateProgress('extracting', 30, '正在解压模型...')
      const zip = await JSZip.loadAsync(arrayBuffer)

      // 查找模型文件 (model.json 或 model3.json)
      let foundModelPath: string | null = null
      let modelJsonContent: string | null = null

      for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
        const fileName = relativePath.toLowerCase()
        if (fileName.endsWith('.model3.json') || fileName.endsWith('.model.json')) {
          if (!foundModelPath || relativePath.length < foundModelPath.length) {
            // 优先选择路径最短的（最顶层的）
            foundModelPath = relativePath
            // 读取模型 JSON 内容
            modelJsonContent = await zipEntry.async('string')
          }
        }
      }

      if (!foundModelPath || !modelJsonContent) {
        throw new Error('未找到模型文件 (model.json 或 model3.json)')
      }

      // 解析模型 JSON 获取信息
      const modelInfo = parseModelJson(modelJsonContent, modelName)

      // 现在 foundModelPath 一定是 string（使用类型断言，因为 TS 无法追踪 forEach 回调中的类型变化）
      const modelJsonPath: string = foundModelPath

      // 获取模型所在的目录
      const modelDir = modelJsonPath.includes('/')
        ? modelJsonPath.substring(0, modelJsonPath.lastIndexOf('/'))
        : ''

      // 清理模型名称，移除非法字符
      const safeModelName = modelName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_')
      const targetDir = `models/${safeModelName}`

      // 阶段3: 保存文件
      updateProgress('saving', 50, '正在保存模型文件...')

      // 在原生平台上使用 Filesystem API
      if (Capacitor.isNativePlatform()) {
        // 确保目标目录存在
        try {
          await Filesystem.mkdir({
            path: targetDir,
            directory: Directory.Data,
            recursive: true,
          })
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

          const targetPath = `${targetDir}/${relativePath}`

          // 确保父目录存在
          const parentDir = targetPath.substring(0, targetPath.lastIndexOf('/'))
          if (parentDir && parentDir !== targetDir) {
            try {
              await Filesystem.mkdir({
                path: parentDir,
                directory: Directory.Data,
                recursive: true,
              })
            } catch {
              // 目录可能已存在
            }
          }

          // 读取文件内容
          const content = await zipEntry.async('base64')

          // 判断是否是文本文件
          const isTextFile = /\.(json|txt|html|css|js|xml)$/i.test(filePath)

          if (isTextFile) {
            // 文本文件：解码 base64 并保存
            const textContent = atob(content)
            await Filesystem.writeFile({
              path: targetPath,
              data: textContent,
              directory: Directory.Data,
              encoding: Encoding.UTF8,
            })
          } else {
            // 二进制文件：直接保存 base64
            await Filesystem.writeFile({
              path: targetPath,
              data: content,
              directory: Directory.Data,
            })
          }

          savedCount++
          const progress = 50 + Math.floor((savedCount / files.length) * 40)
          updateProgress('saving', progress, `正在保存文件 (${savedCount}/${files.length})...`)
        }

        // 更新总文件数
        modelInfo.totalFiles = savedCount

        // 获取模型 JSON 的完整路径
        const modelFileName = modelJsonPath.includes('/')
          ? modelJsonPath.substring(modelJsonPath.lastIndexOf('/') + 1)
          : modelJsonPath

        // 返回可访问的 URL
        const uriResult = await Filesystem.getUri({
          path: `${targetDir}/${modelFileName}`,
          directory: Directory.Data,
        })

        updateProgress('done', 100, '模型上传成功！')
        return {
          path: uriResult.uri,
          info: modelInfo,
        }
      } else {
        // Web 平台：使用 IndexedDB 或 localStorage
        // 这里简化处理，返回一个相对路径提示
        updateProgress('done', 100, '请将模型放入 public/models 目录')
        error.value = 'Web 平台请手动将模型放入 public/models 目录'
        return null
      }
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
    if (!Capacitor.isNativePlatform()) {
      return []
    }

    try {
      const result = await Filesystem.readdir({
        path: 'models',
        directory: Directory.Data,
      })
      return result.files
        .filter(f => f.type === 'directory')
        .map(f => f.name)
    } catch {
      return []
    }
  }

  /**
   * 删除已上传的模型
   */
  const deleteModel = async (modelName: string): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) {
      return false
    }

    try {
      await Filesystem.rmdir({
        path: `models/${modelName}`,
        directory: Directory.Data,
        recursive: true,
      })
      return true
    } catch (e) {
      console.error('Delete model error:', e)
      return false
    }
  }

  /**
   * 解析模型 JSON 获取模型信息
   */
  const parseModelJson = (jsonContent: string, modelName: string): ModelUploadInfo => {
    const info: ModelUploadInfo = {
      modelName,
      expressionCount: 0,
      motionGroups: [],
      textureCount: 0,
      totalFiles: 0,
    }

    try {
      const modelData = JSON.parse(jsonContent)

      // Cubism 3/4 格式 (model3.json)
      if (modelData.FileReferences) {
        const fileRefs = modelData.FileReferences

        // 表情
        if (fileRefs.Expressions && Array.isArray(fileRefs.Expressions)) {
          info.expressionCount = fileRefs.Expressions.length
        }

        // 动作
        if (fileRefs.Motions) {
          for (const [groupName, motions] of Object.entries(fileRefs.Motions)) {
            if (Array.isArray(motions)) {
              info.motionGroups.push({
                group: groupName,
                count: motions.length,
              })
            }
          }
        }

        // 纹理
        if (fileRefs.Textures && Array.isArray(fileRefs.Textures)) {
          info.textureCount = fileRefs.Textures.length
        }
      }
      // Cubism 2 格式 (model.json)
      else {
        // 表情
        if (modelData.expressions && Array.isArray(modelData.expressions)) {
          info.expressionCount = modelData.expressions.length
        }

        // 动作
        if (modelData.motions) {
          for (const [groupName, motions] of Object.entries(modelData.motions)) {
            if (Array.isArray(motions)) {
              info.motionGroups.push({
                group: groupName,
                count: motions.length,
              })
            }
          }
        }

        // 纹理
        if (modelData.textures && Array.isArray(modelData.textures)) {
          info.textureCount = modelData.textures.length
        }
      }
    } catch (e) {
      console.warn('Failed to parse model JSON for info:', e)
    }

    return info
  }

  const updateProgress = (stage: UploadProgress['stage'], progress: number, message: string) => {
    uploadProgress.value = { stage, progress, message }
  }

  return {
    isUploading,
    uploadProgress,
    error,
    uploadModel,
    getUploadedModels,
    deleteModel,
  }
}
