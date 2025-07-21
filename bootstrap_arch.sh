#!/usr/sbin/sh
cd ~
pacman -Syyuu --noconfirm
pacman -S nushell helix neovim fd bat ripgrep zoxide eza starship just git fzf yazi difftastic openssh github-cli uutils-coreutils wl-clipboard base-devel --noconfirm
git clone https://github.com/groutoutlook/nushellConfig ~/.config/nushell
git clone https://github.com/groutoutlook/dotfiles
ln -sr ~/dotfiles/.gitconfig ~
ln -sr ~/dotfiles/config/ov ~/.config
ln -sr ~/dotfiles/config/bat ~/.config
ln -sr ~/dotfiles/config/helix ~/.config
ln -sr ~/dotfiles/config/starship.toml ~/.config
ln -sr ~/dotfiles/config/.ripgreprc ~/.config
ln -s /usr/bin/hx /usr/bin/helix
chsh -s /usr/bin/nu
useradd -m -G wheel -s /usr/bin/nu golk
cp /etc/sudoers /etc/sudoers.bak
perl -i -pe 's/^#\s*(%wheel\s+ALL=\(ALL:ALL\)\s+ALL)/$1/' /etc/sudoers
echo "Wheel group granted sudo access."
systemctl reboot

