//! PDF 阅读器插件
//!
//! 本插件为 TableFri 提供 PDF 文档阅读功能：
//! - 打开和读取 PDF 文件
//! - 提取页面文本内容
//! - 获取文档信息
//! - 响应文本选择事件

use lopdf::Document;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;
use tablefri_plugin_api::*;

/// PDF 文档信息
#[derive(Debug, Clone, Serialize, Deserialize)]
struct PdfInfo {
    path: String,
    page_count: usize,
    title: Option<String>,
    author: Option<String>,
}

/// PDF 阅读器插件
pub struct PdfReaderPlugin {
    /// 插件上下文
    ctx: Option<PluginContext>,
    /// 当前打开的 PDF 文档
    current_pdf: Mutex<Option<Document>>,
    /// 当前 PDF 路径
    current_path: Mutex<Option<String>>,
    /// 用户选中的文本
    selected_text: Mutex<String>,
    /// 页面内容缓存
    page_cache: Mutex<HashMap<usize, String>>,
}

impl Default for PdfReaderPlugin {
    fn default() -> Self {
        Self {
            ctx: None,
            current_pdf: Mutex::new(None),
            current_path: Mutex::new(None),
            selected_text: Mutex::new(String::new()),
            page_cache: Mutex::new(HashMap::new()),
        }
    }
}

impl PdfReaderPlugin {
    /// 打开 PDF 文件
    fn open_pdf(&self, path: &str) -> Result<PdfInfo, String> {
        let doc = Document::load(path).map_err(|e| format!("无法打开 PDF: {}", e))?;

        let page_count = doc.get_pages().len();

        // 尝试获取文档信息
        let title = self.get_document_info(&doc, "Title");
        let author = self.get_document_info(&doc, "Author");

        // 存储文档
        *self.current_pdf.lock().unwrap() = Some(doc);
        *self.current_path.lock().unwrap() = Some(path.to_string());
        self.page_cache.lock().unwrap().clear();

        Ok(PdfInfo {
            path: path.to_string(),
            page_count,
            title,
            author,
        })
    }

    /// 获取文档信息字段
    fn get_document_info(&self, doc: &Document, key: &str) -> Option<String> {
        doc.trailer
            .get(b"Info")
            .ok()
            .and_then(|info| doc.get_object(info.as_reference().ok()?).ok())
            .and_then(|info_dict| info_dict.as_dict().ok())
            .and_then(|dict| dict.get(key.as_bytes()).ok())
            .and_then(|value| {
                // lopdf as_string returns Cow<str>
                match value {
                    lopdf::Object::String(bytes, _) => {
                        Some(String::from_utf8_lossy(bytes).to_string())
                    }
                    _ => None,
                }
            })
    }

    /// 读取指定页面的文本内容
    fn read_page(&self, page_num: usize) -> Result<String, String> {
        // 检查缓存
        if let Some(cached) = self.page_cache.lock().unwrap().get(&page_num) {
            return Ok(cached.clone());
        }

        let pdf_guard = self.current_pdf.lock().unwrap();
        let doc = pdf_guard
            .as_ref()
            .ok_or_else(|| "没有打开的 PDF 文档".to_string())?;

        // 获取页面 ID
        let page_ids: Vec<_> = doc.get_pages().keys().cloned().collect();
        let page_id = page_ids
            .get(page_num.saturating_sub(1))
            .ok_or_else(|| format!("页码 {} 超出范围", page_num))?;

        // 提取页面文本
        let text = doc
            .extract_text(&[*page_id])
            .map_err(|e| format!("提取文本失败: {}", e))?;

        // 缓存结果
        drop(pdf_guard);
        self.page_cache
            .lock()
            .unwrap()
            .insert(page_num, text.clone());

        Ok(text)
    }

    /// 获取当前文档信息
    fn get_pdf_info(&self) -> Result<PdfInfo, String> {
        let path_guard = self.current_path.lock().unwrap();
        let path = path_guard
            .as_ref()
            .ok_or_else(|| "没有打开的 PDF 文档".to_string())?;

        let pdf_guard = self.current_pdf.lock().unwrap();
        let doc = pdf_guard
            .as_ref()
            .ok_or_else(|| "没有打开的 PDF 文档".to_string())?;

        let page_count = doc.get_pages().len();
        let title = self.get_document_info(doc, "Title");
        let author = self.get_document_info(doc, "Author");

        Ok(PdfInfo {
            path: path.clone(),
            page_count,
            title,
            author,
        })
    }

    /// 搜索文本
    fn search_text(&self, query: &str) -> Result<Vec<SearchResult>, String> {
        let pdf_guard = self.current_pdf.lock().unwrap();
        let doc = pdf_guard
            .as_ref()
            .ok_or_else(|| "没有打开的 PDF 文档".to_string())?;

        let mut results = Vec::new();
        let page_ids: Vec<_> = doc.get_pages().keys().cloned().collect();

        for (idx, page_id) in page_ids.iter().enumerate() {
            if let Ok(text) = doc.extract_text(&[*page_id]) {
                if text.to_lowercase().contains(&query.to_lowercase()) {
                    // 提取包含搜索词的上下文
                    let context = self.extract_context(&text, query);
                    results.push(SearchResult {
                        page: idx + 1,
                        context,
                    });
                }
            }
        }

        Ok(results)
    }

    /// 提取搜索结果的上下文
    fn extract_context(&self, text: &str, query: &str) -> String {
        let lower_text = text.to_lowercase();
        let lower_query = query.to_lowercase();

        if let Some(pos) = lower_text.find(&lower_query) {
            let start = pos.saturating_sub(50);
            let end = (pos + query.len() + 50).min(text.len());

            let mut context = String::new();
            if start > 0 {
                context.push_str("...");
            }
            context.push_str(&text[start..end].replace('\n', " "));
            if end < text.len() {
                context.push_str("...");
            }
            context
        } else {
            String::new()
        }
    }
}

/// 搜索结果
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SearchResult {
    page: usize,
    context: String,
}

impl Plugin for PdfReaderPlugin {
    fn initialize(&mut self, ctx: &PluginContext) -> Result<(), String> {
        self.ctx = Some(ctx.clone());
        println!("[PDF Reader] 插件已初始化，数据目录: {:?}", ctx.data_dir);
        Ok(())
    }

    fn shutdown(&mut self) -> Result<(), String> {
        // 清理资源
        *self.current_pdf.lock().unwrap() = None;
        *self.current_path.lock().unwrap() = None;
        self.page_cache.lock().unwrap().clear();
        println!("[PDF Reader] 插件已关闭");
        Ok(())
    }

    fn get_tools(&self) -> Vec<ToolDefinition> {
        let plugin_id = self
            .ctx
            .as_ref()
            .map(|c| c.plugin_id.clone())
            .unwrap_or_else(|| "pdf-reader".to_string());

        vec![
            ToolDefinition::new(
                &plugin_id,
                "open_pdf",
                "打开 PDF 文件。打开后可以读取页面内容和获取文档信息。",
                json!({
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "PDF 文件的完整路径"
                        }
                    },
                    "required": ["path"]
                }),
            ),
            ToolDefinition::new(
                &plugin_id,
                "read_pdf_page",
                "读取 PDF 指定页面的文本内容。需要先打开 PDF 文件。",
                json!({
                    "type": "object",
                    "properties": {
                        "page": {
                            "type": "number",
                            "description": "要读取的页码（从 1 开始）"
                        }
                    },
                    "required": ["page"]
                }),
            ),
            ToolDefinition::no_params(
                &plugin_id,
                "get_pdf_info",
                "获取当前打开的 PDF 文档信息，包括路径、页数、标题和作者。",
            ),
            ToolDefinition::new(
                &plugin_id,
                "search_pdf",
                "在 PDF 文档中搜索文本，返回包含搜索词的页码和上下文。",
                json!({
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "要搜索的文本"
                        }
                    },
                    "required": ["query"]
                }),
            ),
            ToolDefinition::no_params(
                &plugin_id,
                "get_selected_text",
                "获取用户在 PDF 中选中的文本内容。",
            ),
        ]
    }

    fn execute_tool(&self, call: &ToolCall) -> ToolResult {
        match call.name.as_str() {
            "open_pdf" => {
                let path = call.arguments["path"]
                    .as_str()
                    .ok_or_else(|| "缺少 path 参数".to_string());

                match path {
                    Ok(p) => match self.open_pdf(p) {
                        Ok(info) => ToolResult::success(json!(info)),
                        Err(e) => ToolResult::error(&e),
                    },
                    Err(e) => ToolResult::error(&e),
                }
            }

            "read_pdf_page" => {
                let page = call.arguments["page"].as_u64().unwrap_or(1) as usize;
                match self.read_page(page) {
                    Ok(content) => ToolResult::success(json!({
                        "page": page,
                        "content": content
                    })),
                    Err(e) => ToolResult::error(&e),
                }
            }

            "get_pdf_info" => match self.get_pdf_info() {
                Ok(info) => ToolResult::success(json!(info)),
                Err(e) => ToolResult::error(&e),
            },

            "search_pdf" => {
                let query = call.arguments["query"].as_str().unwrap_or("");
                if query.is_empty() {
                    return ToolResult::error("搜索词不能为空");
                }
                match self.search_text(query) {
                    Ok(results) => ToolResult::success(json!({
                        "query": query,
                        "results": results,
                        "count": results.len()
                    })),
                    Err(e) => ToolResult::error(&e),
                }
            }

            "get_selected_text" => {
                let text = self.selected_text.lock().unwrap().clone();
                ToolResult::success(json!({ "text": text }))
            }

            _ => ToolResult::error(&format!("未知工具: {}", call.name)),
        }
    }

    fn on_hook(&mut self, hook_name: &str, data: &Value) -> Option<Value> {
        match hook_name {
            hooks::ON_FILE_OPEN => {
                // 检查是否是 PDF 文件
                let path = data.get("path")?.as_str()?;
                if path.to_lowercase().ends_with(".pdf") {
                    // 尝试打开 PDF（加载到内存供后续工具调用使用）
                    match self.open_pdf(path) {
                        Ok(info) => {
                            // 返回 open_window 动作，让前端打开 PDF 阅读器窗口
                            return Some(json!({
                                "action": "open_window",
                                "window": "viewer",
                                "title": format!("PDF - {}", info.title.as_deref().unwrap_or(&info.path.split('/').last().unwrap_or("未命名").to_string())),
                                "data": {
                                    "path": path,
                                    "pdf_info": info
                                },
                                "message": format!("已打开 PDF: {} ({} 页)",
                                    info.title.as_deref().unwrap_or("未命名"),
                                    info.page_count
                                )
                            }));
                        }
                        Err(e) => {
                            return Some(json!({
                                "action": "error",
                                "message": format!("无法打开 PDF: {}", e)
                            }));
                        }
                    }
                }
                None
            }

            hooks::ON_TEXT_SELECT => {
                // 保存选中的文本
                if let Some(text_value) = data.get("text") {
                    if let Some(text) = text_value.as_str() {
                        *self.selected_text.lock().unwrap() = text.to_string();

                        // 返回建议，让 LLM 可以评论选中内容
                        return Some(json!({
                            "action": "context_update",
                            "message": format!("用户选中了文本: {}",
                                if text.len() > 100 {
                                    format!("{}...", &text[..100])
                                } else {
                                    text.to_string()
                                }
                            )
                        }));
                    }
                }
                None
            }

            _ => None,
        }
    }
}

// 导出插件
export_plugin!(PdfReaderPlugin, PdfReaderPlugin::default);
