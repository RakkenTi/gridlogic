import './styles/main.css';
import { GridLogicApp } from './ui/app';

const mountEl = document.getElementById('app');
if (mountEl) {
  new GridLogicApp(mountEl);
}
