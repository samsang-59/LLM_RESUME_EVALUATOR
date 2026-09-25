/**
 * @param {'default'|'primary'} [variant]
 * @param {boolean} [block]  full width
 * @param {boolean} [small]
 */
export default function Button({ variant = 'default', block, small, className = '', type = 'button', ...props }) {
  const classes = ['btn', variant === 'primary' && 'btn-primary', block && 'btn-block', small && 'btn-sm', className]
    .filter(Boolean)
    .join(' ');
  return <button type={type} className={classes} {...props} />;
}
