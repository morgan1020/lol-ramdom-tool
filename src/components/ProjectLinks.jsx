import React from 'react';
import { UiIcon } from './UiIcon.jsx';
import './projectLinks.css';

const repositoryUrl = 'https://github.com/morgan1020/lol-ramdom-tool';
export function ProjectLinks() {
  return <nav className="project-links" aria-label="專案與下載">
    <a href={repositoryUrl} target="_blank" rel="noopener noreferrer" title="查看 GitHub 原始碼"><UiIcon name="github" />GitHub</a>
    <a className="app-download-link" href={`${repositoryUrl}/releases/download/v1.4.3/LOL-Random-Tool-1.4.3-Windows-Setup.exe`} title="下載 Windows x64 安裝版"><UiIcon name="download" />App 下載</a>
  </nav>;
}
