#!/usr/sbin/sh
cd ~
yes | pacman -Syu
yes | pacman -S nushell helix neovim fd bat ripgrep direnv zoxide eza starship just git fzf yazi difftastic openssh
git clone https://github.com/groutoutlook/nushellConfig ~/.config/nushell
git clone https://github.com/groutoutlook/dotfiles
cp ~/dotfiles/.gitconfig ~/
cp ~/dotfiles/config/helix ~/.config -rf
cp ~/dotfiles/config/starship.toml ~/.config -rf
cp ~/dotfiles/config/.ripgreprc ~/.config -rf
chsh -s /usr/bin/nu
systemctl reboot
