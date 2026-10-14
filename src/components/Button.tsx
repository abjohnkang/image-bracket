import type { ComponentPropsWithRef } from 'react'
import styles from './Button.module.css'

type ButtonProps = ComponentPropsWithRef<'button'> & {
  variant?: 'primary' | 'secondary' | 'danger'
}

function Button({
  variant = 'secondary',
  type = 'button',
  className,
  ...props
}: ButtonProps) {
  const classes = [styles.button, styles[variant], className]
  return (
    <button type={type} className={classes.filter(Boolean).join(' ')} {...props} />
  )
}

export default Button
