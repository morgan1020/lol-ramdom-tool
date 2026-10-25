import React from 'react';
import top from '../../assets/roles/svg/position-top.svg';
import jungle from '../../assets/roles/svg/position-jungle.svg';
import middle from '../../assets/roles/svg/position-middle.svg';
import bottom from '../../assets/roles/svg/position-bottom.svg';
import utility from '../../assets/roles/svg/position-utility.svg';

const icons = { 上路: top, 打野: jungle, 中路: middle, 下路: bottom, 輔助: utility };

export function RoleIcon({ role }) {
  return <img className="role-glyph" src={icons[role]} alt="" aria-hidden="true" draggable="false" />;
}
