import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'DesktopFriends',
  description: '可爱的 Live2D 桌面宠物，支持 AI 对话和多设备联动',
  lang: 'zh-CN',
  base: '/DesktopFriends/',

  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    ['meta', { name: 'theme-color', content: '#667eea' }],
    ['meta', { name: 'og:type', content: 'website' }],
    ['meta', { name: 'og:title', content: 'DesktopFriends - 桌面宠物' }],
    ['meta', { name: 'og:description', content: '将旧手机变成可爱的 Live2D 桌面宠物' }],
  ],

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: '首页', link: '/' },
      { text: '指南', link: '/guide/' },
      { text: '下载', link: '/download' },
      {
        text: '更多',
        items: [
          { text: '更新日志', link: '/changelog' },
          { text: 'GitHub', link: 'https://github.com/user/DesktopFriends' }
        ]
      }
    ],

    sidebar: {
      '/guide/': [
        {
          text: '开始使用',
          items: [
            { text: '简介', link: '/guide/' },
            { text: '快速开始', link: '/guide/getting-started' },
            { text: '安装 APK', link: '/guide/installation' },
          ]
        },
        {
          text: '功能',
          items: [
            { text: 'AI 对话', link: '/guide/ai-chat' },
            { text: '多设备联动', link: '/guide/multiplayer' },
            { text: '自定义模型', link: '/guide/custom-model' },
          ]
        },
        {
          text: '开发',
          items: [
            { text: '本地开发', link: '/guide/development' },
            { text: '项目结构', link: '/guide/structure' },
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/user/DesktopFriends' }
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024 DesktopFriends'
    },

    search: {
      provider: 'local',
      options: {
        translations: {
          button: {
            buttonText: '搜索文档',
            buttonAriaLabel: '搜索文档'
          },
          modal: {
            noResultsText: '无法找到相关结果',
            resetButtonTitle: '清除查询条件',
            footer: {
              selectText: '选择',
              navigateText: '切换'
            }
          }
        }
      }
    },

    outline: {
      label: '页面导航'
    },

    docFooter: {
      prev: '上一页',
      next: '下一页'
    },

    lastUpdated: {
      text: '最后更新于',
      formatOptions: {
        dateStyle: 'short',
        timeStyle: 'short'
      }
    },

    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '菜单',
    darkModeSwitchLabel: '主题',
  }
})
