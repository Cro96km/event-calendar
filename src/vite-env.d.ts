/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 公開サイトのリポジトリURL(要望・不具合のIssueリンク用)。未設定ならリンクを出さない */
  readonly VITE_REPO_URL?: string;
}
